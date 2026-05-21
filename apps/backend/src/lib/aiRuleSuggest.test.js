'use strict';

/**
 * Tests for lib/aiRuleSuggest.js.
 *
 * Uses the same _setProvider seam as engine/llm.js to inject a fake
 * SDK without making real HTTP calls. Captures console.log to assert
 * the EMF metric line is emitted.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { suggestRule, _setProvider } = require('./aiRuleSuggest.js');

function setLiteLLMEnv() {
  process.env.LITELLM_BASE_URL = 'https://fake-litellm.example.com';
  process.env.LITELLM_API_KEY = 'sk-test';
  process.env.LITELLM_MODEL = 'claude-haiku-4-5';
}

function clearLiteLLMEnv() {
  delete process.env.LITELLM_BASE_URL;
  delete process.env.LITELLM_API_KEY;
  delete process.env.LITELLM_MODEL;
}

const VALID_DRAFT = {
  name: 'Points balance stare - nudge',
  conditions: {
    all: [
      { fact: 'signal', operator: 'equal', value: 'points_balance_stare' },
      { fact: 'dwellMs', operator: 'greaterThanInclusive', value: 8000 },
    ],
  },
  event: {
    type: 'points-balance-stare-nudge',
    params: {
      action: 'NUDGE',
      surface: 'nudge_banner',
      score: 60,
      copy: 'Looking at your points balance? Tap to see what you can do.',
    },
  },
  explanation: 'Triggers when a user lingers on their points balance.',
};

// ---------------------------------------------------------------------------
// 1. Missing env vars: must return null without invoking the SDK
// ---------------------------------------------------------------------------

describe('aiRuleSuggest: missing env vars', () => {
  before(() => {
    clearLiteLLMEnv();
    _setProvider(null);
  });
  after(() => {
    clearLiteLLMEnv();
    _setProvider(null);
  });

  test('returns null when LITELLM_BASE_URL is absent', async () => {
    process.env.LITELLM_API_KEY = 'sk-only';
    const result = await suggestRule('show a nudge after long dwell');
    assert.equal(result, null);
    delete process.env.LITELLM_API_KEY;
  });

  test('returns null when LITELLM_API_KEY is absent', async () => {
    process.env.LITELLM_BASE_URL = 'https://x.example';
    const result = await suggestRule('show a nudge after long dwell');
    assert.equal(result, null);
    delete process.env.LITELLM_BASE_URL;
  });

  test('returns null when both env vars are absent', async () => {
    const result = await suggestRule('show a nudge after long dwell');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Successful suggestion: returns the validated draft object
// ---------------------------------------------------------------------------

describe('aiRuleSuggest: successful suggestion', () => {
  let originalLog;
  let logLines;

  before(() => {
    setLiteLLMEnv();
    originalLog = console.log;
    logLines = [];
    console.log = (...args) => logLines.push(args.join(' '));
  });

  after(() => {
    console.log = originalLog;
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns the draft object when the provider yields a valid shape', async () => {
    _setProvider({
      generateObject: async () => ({ object: VALID_DRAFT, usage: {} }),
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await suggestRule('Stare at points balance for over 8s, nudge them.');

    assert.ok(result !== null, 'expected a non-null draft');
    assert.equal(result.name, VALID_DRAFT.name);
    assert.equal(result.event.params.action, 'NUDGE');
    assert.equal(result.event.params.score, 60);
    assert.deepEqual(result.conditions.all[0], {
      fact: 'signal',
      operator: 'equal',
      value: 'points_balance_stare',
    });
  });

  test('emits an EMF metric on success with the documented namespace', () => {
    const emfLine = logLines.find((l) => {
      try {
        return JSON.parse(l)._aws !== undefined;
      } catch {
        return false;
      }
    });
    assert.ok(emfLine != null, 'expected an EMF metric log line');

    const parsed = JSON.parse(emfLine);
    assert.equal(parsed._aws.CloudWatchMetrics[0].Namespace, 'SignalForce');
    const metricNames = parsed._aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name);
    assert.ok(metricNames.includes('RuleAiSuggest'), 'RuleAiSuggest metric must exist');
    assert.equal(parsed.Outcome, 'success');
    assert.equal(parsed.RuleAiSuggest, 1);
    assert.equal(parsed.Model, 'claude-haiku-4-5');
  });
});

// ---------------------------------------------------------------------------
// 3. Schema mismatch: malformed object => null
// ---------------------------------------------------------------------------

describe('aiRuleSuggest: schema mismatch', () => {
  before(() => {
    setLiteLLMEnv();
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns null when the provider returns an object missing required fields', async () => {
    _setProvider({
      generateObject: async () => ({
        // name and event missing => zod parse will throw
        object: { conditions: { all: [] } },
        usage: {},
      }),
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await suggestRule('do something with the user');
    assert.equal(result, null);
  });

  test('returns null when the provider throws a schema error', async () => {
    _setProvider({
      generateObject: async () => {
        const err = new Error('No object could be generated from the model output.');
        err.name = 'AI_NoObjectGeneratedError';
        throw err;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await suggestRule('ambiguous request');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Empty input: must return null without calling the SDK
// ---------------------------------------------------------------------------

describe('aiRuleSuggest: empty input', () => {
  before(() => {
    setLiteLLMEnv();
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns null when called with an empty string', async () => {
    let called = false;
    _setProvider({
      generateObject: async () => {
        called = true;
        return { object: VALID_DRAFT, usage: {} };
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await suggestRule('   ');
    assert.equal(result, null);
    assert.equal(called, false, 'provider must not be invoked on empty input');
  });
});
