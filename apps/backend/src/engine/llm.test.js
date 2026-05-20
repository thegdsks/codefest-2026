'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers to manage env vars cleanly per test
// ---------------------------------------------------------------------------

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }
}

function clearLiteLLMEnv() {
  delete process.env.LITELLM_BASE_URL;
  delete process.env.LITELLM_API_KEY;
  delete process.env.LITELLM_MODEL;
}

// ---------------------------------------------------------------------------
// The module is required once; the _setProvider seam allows injecting a fake
// provider per test without re-requiring.
// ---------------------------------------------------------------------------

const { classify, writeText, _setProvider } = require('./llm.js');

// ---------------------------------------------------------------------------
// 1. Missing env vars - both methods must return null without calling the SDK
// ---------------------------------------------------------------------------

describe('missing env vars', () => {
  before(() => {
    clearLiteLLMEnv();
    // Ensure the provider seam is cleared so the module re-checks env vars
    _setProvider(null);
  });
  after(() => {
    clearLiteLLMEnv();
    _setProvider(null);
  });

  test('classify returns null when LITELLM_BASE_URL is absent', async () => {
    const result = await classify('is this fraud?');
    assert.equal(result, null);
  });

  test('writeText returns null when LITELLM_API_KEY is absent', async () => {
    const result = await writeText('write a loyalty nudge');
    assert.equal(result, null);
  });

  test('classify returns null when only API key is set', async () => {
    process.env.LITELLM_API_KEY = 'test-key';
    const result = await classify('test');
    assert.equal(result, null);
    delete process.env.LITELLM_API_KEY;
  });
});

// ---------------------------------------------------------------------------
// 2. Successful classify - inject a fake provider, check returned shape
// ---------------------------------------------------------------------------

describe('successful classify', () => {
  let originalLog;
  let logLines;

  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'claude-haiku-4-5',
    });

    // Capture console.log for EMF metric assertion
    originalLog = console.log;
    logLines = [];
    console.log = (...args) => logLines.push(args.join(' '));
  });

  after(() => {
    console.log = originalLog;
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns correct shape with latencyMs as number', async () => {
    // Inject a fake provider whose model() function returns an object that
    // generateObject will use. We stub at the module level by injecting a
    // fake that makes generateObject produce a known value.
    //
    // Since generateObject calls provider(modelName) to get the language model,
    // we inject a fake at the _setProvider seam so the real SDK path is bypassed.
    // The fake generateObject is injected via _setProvider({ generateObject, generateText }).
    //
    // However the cleanest seam is to replace the internal sdk functions directly.
    // llm.js exposes _setProvider(p) where p = { generateObject, generateText } for tests.

    _setProvider({
      generateObject: async () => ({
        object: { label: 'ALLOW', confidence: 0.95, rationale: 'Low risk login' },
        usage: { totalTokens: 42 },
      }),
      generateText: async () => ({ text: '', usage: {} }),
    });

    logLines = [];
    const result = await classify('User logged in from 3 different countries in 2 minutes.');

    assert.ok(result !== null, 'expected a non-null result');
    assert.equal(result.label, 'ALLOW');
    assert.equal(result.confidence, 0.95);
    assert.equal(result.rationale, 'Low risk login');
    assert.ok(typeof result.latencyMs === 'number', 'latencyMs should be a number');
    assert.ok(result.latencyMs >= 0, 'latencyMs should be non-negative');
    assert.equal(result.model, 'claude-haiku-4-5');
  });

  test('EMF metric line is emitted on classify success with correct shape', () => {
    // logLines captured from previous test (classify success)
    const emfLine = logLines.find((l) => {
      try {
        return JSON.parse(l)._aws !== undefined;
      } catch {
        return false;
      }
    });
    assert.ok(emfLine != null, 'expected an EMF metric log line');

    const parsed = JSON.parse(emfLine);
    assert.ok(parsed._aws, '_aws key must be present');
    assert.equal(parsed._aws.CloudWatchMetrics[0].Namespace, 'SignalForce');
    assert.equal(parsed.Outcome, 'success');
    assert.equal(parsed.LLMInvocations, 1);
    assert.ok(typeof parsed.LLMLatencyMs === 'number', 'LLMLatencyMs must be a number');
    assert.equal(parsed.Model, 'claude-haiku-4-5');
    assert.deepEqual(parsed._aws.CloudWatchMetrics[0].Dimensions, [['Model', 'Outcome']]);
    const metricNames = parsed._aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name);
    assert.ok(metricNames.includes('LLMInvocations'), 'LLMInvocations metric must exist');
    assert.ok(metricNames.includes('LLMLatencyMs'), 'LLMLatencyMs metric must exist');
  });

  test('writeText returns correct shape', async () => {
    _setProvider({
      generateObject: async () => ({ object: {}, usage: {} }),
      generateText: async () => ({
        text: 'Earn 500 bonus points on your next stay.',
        usage: { totalTokens: 20 },
      }),
    });

    const result = await writeText('Write a short loyalty offer for a Gold member.');

    assert.ok(result !== null, 'expected a non-null result');
    assert.ok(typeof result.text === 'string', 'text should be a string');
    assert.ok(result.text.length > 0, 'text should not be empty');
    assert.ok(typeof result.latencyMs === 'number', 'latencyMs should be a number');
    assert.equal(result.model, 'claude-haiku-4-5');
  });
});

// ---------------------------------------------------------------------------
// 3. Schema mismatch on classify - stub returns malformed data, must return null
// ---------------------------------------------------------------------------

describe('schema mismatch', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'claude-haiku-4-5',
    });
  });

  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('classify returns null when generateObject throws a schema error', async () => {
    _setProvider({
      generateObject: async () => {
        const err = new Error(
          'Schema validation failed: label must be one of ALLOW|REVIEW|BLOCK|MFA'
        );
        err.name = 'AI_NoObjectGeneratedError';
        throw err;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('ambiguous event');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Timeout / abort - simulate AbortError, must return null
// ---------------------------------------------------------------------------

describe('timeout handling', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'claude-haiku-4-5',
    });
  });

  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('classify returns null when generateObject throws an AbortError', async () => {
    _setProvider({
      generateObject: async () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('hanging prompt');
    assert.equal(result, null);
  });

  test('writeText returns null when generateText throws an AbortError', async () => {
    _setProvider({
      generateObject: async () => ({ object: {}, usage: {} }),
      generateText: async () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      },
    });

    const result = await writeText('hanging nudge');
    assert.equal(result, null);
  });
});
