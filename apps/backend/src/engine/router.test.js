'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers: build L1 draft objects for each scenario
// ---------------------------------------------------------------------------

function makeDraft(overrides) {
  return {
    score: 10,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'NORMAL_LOGIN',
    reasonText: 'Login looks normal.',
    category: 'AUTH',
    needsExplanation: false,
    ...overrides,
  };
}

function makeCtx(overrides) {
  return {
    userId: 'user-test-001',
    category: 'AUTH',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stub factory: produce a fake llm client with controllable return values.
// ---------------------------------------------------------------------------

function fakeClassify(value) {
  let called = false;
  return {
    classify: async () => {
      called = true;
      return value;
    },
    writeText: async () => null,
    wasCalled: () => called,
  };
}

function fakeWriteText(value) {
  let called = false;
  return {
    classify: async () => null,
    writeText: async () => {
      called = true;
      return value;
    },
    wasCalled: () => called,
  };
}

// ---------------------------------------------------------------------------
// 1. Clear LOW (score < 40, needsExplanation false) => L1 verbatim, no LLM
// ---------------------------------------------------------------------------

describe('clear LOW case', () => {
  test('returns L1 verbatim with engineLayer L1 and does not call classify', async () => {
    const stub = fakeClassify({ label: 'ALLOW', confidence: 0.9, latencyMs: 20, model: 'm' });
    const { route } = require('./router');
    const draft = makeDraft({
      score: 10,
      riskLevel: 'LOW',
      action: 'ALLOW',
      needsExplanation: false,
    });
    const final = await route(draft, makeCtx(), { llm: stub });

    assert.equal(final.score, 10);
    assert.equal(final.action, 'ALLOW');
    assert.equal(final.engineLayer, 'L1');
    assert.equal(stub.wasCalled(), false, 'classify must not be called for clear LOW');
    assert.equal(final.llmLatencyMs, undefined);
    assert.equal(final.llmModel, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. Clear HIGH (score > 70, needsExplanation false) => L1 verbatim, no LLM
// ---------------------------------------------------------------------------

describe('clear HIGH case', () => {
  test('returns L1 verbatim with engineLayer L1 and does not call classify', async () => {
    const stub = fakeClassify({ label: 'BLOCK', confidence: 0.99, latencyMs: 20, model: 'm' });
    const { route } = require('./router');
    const draft = makeDraft({
      score: 90,
      riskLevel: 'HIGH',
      action: 'BLOCK',
      needsExplanation: false,
    });
    const final = await route(draft, makeCtx(), { llm: stub });

    assert.equal(final.score, 90);
    assert.equal(final.action, 'BLOCK');
    assert.equal(final.engineLayer, 'L1');
    assert.equal(stub.wasCalled(), false, 'classify must not be called for clear HIGH');
  });
});

// ---------------------------------------------------------------------------
// 3. Gray-zone MEDIUM: L2 returns ALLOW/0.8 => downgrade action to ALLOW
// ---------------------------------------------------------------------------

describe('gray zone with L2 ALLOW/0.8', () => {
  test('downgrades action to ALLOW and sets engineLayer L1+L2', async () => {
    const stub = fakeClassify({
      label: 'ALLOW',
      confidence: 0.8,
      rationale: 'Low contextual risk.',
      latencyMs: 45,
      model: 'claude-haiku-4-5',
    });
    const { route } = require('./router');
    const draft = makeDraft({
      score: 60,
      riskLevel: 'MEDIUM',
      action: 'REVIEW',
      needsExplanation: true,
      category: 'EARN_REDEEM',
    });
    const final = await route(draft, makeCtx({ category: 'EARN_REDEEM' }), { llm: stub });

    assert.equal(stub.wasCalled(), true, 'classify should be called in gray zone');
    assert.equal(final.action, 'ALLOW');
    assert.equal(final.engineLayer, 'L1+L2');
    assert.ok(typeof final.llmLatencyMs === 'number', 'llmLatencyMs should be a number');
    assert.equal(final.llmModel, 'claude-haiku-4-5');
    assert.ok(final.score >= 0 && final.score <= 100, 'score should be clamped 0..100');
  });
});

// ---------------------------------------------------------------------------
// 4. Gray-zone MEDIUM: L2 returns BLOCK/0.85 => escalate to BLOCK
// ---------------------------------------------------------------------------

describe('gray zone with L2 BLOCK/0.85', () => {
  test('escalates action to BLOCK and sets engineLayer L1+L2', async () => {
    const stub = fakeClassify({
      label: 'BLOCK',
      confidence: 0.85,
      rationale: 'Pattern consistent with account takeover.',
      latencyMs: 60,
      model: 'claude-haiku-4-5',
    });
    const { route } = require('./router');
    const draft = makeDraft({
      score: 60,
      riskLevel: 'MEDIUM',
      action: 'MFA',
      needsExplanation: true,
      category: 'AUTH',
    });
    const final = await route(draft, makeCtx(), { llm: stub });

    assert.equal(stub.wasCalled(), true, 'classify should be called in gray zone');
    assert.equal(final.action, 'BLOCK');
    assert.equal(final.engineLayer, 'L1+L2');
    assert.ok(typeof final.llmLatencyMs === 'number');
    assert.equal(final.llmModel, 'claude-haiku-4-5');
  });
});

// ---------------------------------------------------------------------------
// 5. Gray-zone: classify returns null (LLM down) => fall back to L1 verbatim
// ---------------------------------------------------------------------------

describe('gray zone with LLM unavailable (null)', () => {
  test('falls back to L1, engineLayer stays L1', async () => {
    const stub = fakeClassify(null);
    const { route } = require('./router');
    const draft = makeDraft({
      score: 60,
      riskLevel: 'MEDIUM',
      action: 'REVIEW',
      needsExplanation: true,
      category: 'EARN_REDEEM',
    });
    const final = await route(draft, makeCtx({ category: 'EARN_REDEEM' }), { llm: stub });

    assert.equal(final.action, 'REVIEW', 'should keep L1 action when LLM is null');
    assert.equal(final.engineLayer, 'L1');
    assert.equal(final.llmLatencyMs, undefined);
    assert.equal(final.llmModel, undefined);
  });
});

// ---------------------------------------------------------------------------
// 6. NUDGE: writeText returns text => attach generatedText, engineLayer L1+L2
// ---------------------------------------------------------------------------

describe('NUDGE with writeText success', () => {
  test('attaches generatedText and marks engineLayer L1+L2', async () => {
    const stub = fakeWriteText({
      text: 'Add your phone number to earn 200 bonus points.',
      latencyMs: 30,
      model: 'claude-haiku-4-5',
    });
    const { route } = require('./router');
    const draft = makeDraft({
      score: 70,
      riskLevel: 'MEDIUM',
      action: 'NUDGE',
      needsExplanation: true,
      category: 'PROFILE',
    });
    const final = await route(draft, makeCtx({ category: 'PROFILE' }), { llm: stub });

    assert.equal(stub.wasCalled(), true, 'writeText should be called for NUDGE');
    assert.equal(final.action, 'NUDGE');
    assert.equal(final.engineLayer, 'L1+L2');
    assert.equal(final.generatedText, 'Add your phone number to earn 200 bonus points.');
    assert.ok(typeof final.llmLatencyMs === 'number');
    assert.equal(final.llmModel, 'claude-haiku-4-5');
  });
});

// ---------------------------------------------------------------------------
// 7. NUDGE: writeText returns null => templated default text, engineLayer L1
// ---------------------------------------------------------------------------

describe('NUDGE with writeText returning null', () => {
  test('uses templated default and keeps engineLayer L1', async () => {
    const stub = fakeWriteText(null);
    const { route } = require('./router');
    const draft = makeDraft({
      score: 70,
      riskLevel: 'MEDIUM',
      action: 'NUDGE',
      needsExplanation: true,
      category: 'PROFILE',
    });
    const final = await route(draft, makeCtx({ category: 'PROFILE' }), { llm: stub });

    assert.equal(stub.wasCalled(), true, 'writeText should still be attempted for NUDGE');
    assert.equal(final.action, 'NUDGE');
    assert.equal(final.engineLayer, 'L1');
    assert.equal(
      final.generatedText,
      'Complete your profile to speed up booking',
      'should use the default nudge text'
    );
    assert.equal(final.llmLatencyMs, undefined);
    assert.equal(final.llmModel, undefined);
  });
});

// ---------------------------------------------------------------------------
// 8. L2 ALLOW with confidence <= 0.7 => keep L1 action (no downgrade)
// ---------------------------------------------------------------------------

describe('gray zone with L2 ALLOW but low confidence', () => {
  test('keeps L1 action when L2 confidence is at or below 0.7', async () => {
    const stub = fakeClassify({
      label: 'ALLOW',
      confidence: 0.65,
      latencyMs: 40,
      model: 'claude-haiku-4-5',
    });
    const { route } = require('./router');
    const draft = makeDraft({
      score: 60,
      riskLevel: 'MEDIUM',
      action: 'MFA',
      needsExplanation: true,
      category: 'AUTH',
    });
    const final = await route(draft, makeCtx(), { llm: stub });

    assert.equal(final.action, 'MFA', 'should not downgrade when confidence <= 0.7');
    assert.equal(final.engineLayer, 'L1+L2');
  });
});

// ---------------------------------------------------------------------------
// 9. score clamping: engineLayer and score must always be within bounds
// ---------------------------------------------------------------------------

describe('score clamping', () => {
  test('final score is clamped within 0..100', async () => {
    const stub = fakeClassify(null);
    const { route } = require('./router');
    const draft = makeDraft({ score: 50, riskLevel: 'MEDIUM', needsExplanation: true });
    const final = await route(draft, makeCtx(), { llm: stub });

    assert.ok(final.score >= 0 && final.score <= 100, `score out of range: ${final.score}`);
  });
});
