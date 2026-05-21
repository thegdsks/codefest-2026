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
  delete process.env.LITELLM_FALLBACK_MODELS;
  delete process.env.LITELLM_TIMEOUT_MS;
  delete process.env.LITELLM_TOTAL_BUDGET_MS;
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
// 2. Successful classify - primary model succeeds, no fallback needed
// ---------------------------------------------------------------------------

describe('successful classify - primary model', () => {
  let originalLog;
  let logLines;

  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'claude-haiku-4-5',
    });

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
// 3. Schema mismatch on classify - stub returns malformed data, must return
//    rule-only fallback sentinel (no fallback models configured)
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

  test('classify returns rule-only sentinel when generateObject throws a schema error', async () => {
    _setProvider({
      generateObject: async () => {
        const e = new Error(
          'Schema validation failed: label must be one of ALLOW|REVIEW|BLOCK|MFA'
        );
        e.name = 'AI_NoObjectGeneratedError';
        throw e;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('ambiguous event');
    assert.ok(result !== null, 'result should not be null');
    assert.equal(result.source, 'rule-only-fallback');
    assert.equal(result.reason, 'all-llm-models-unavailable');
  });
});

// ---------------------------------------------------------------------------
// 4. Timeout / abort - simulate AbortError, triggers fallback or sentinel
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

  test('classify returns rule-only sentinel when generateObject throws an AbortError', async () => {
    _setProvider({
      generateObject: async () => {
        const e = new Error('The operation was aborted.');
        e.name = 'AbortError';
        throw e;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('hanging prompt');
    assert.ok(result !== null, 'result should not be null');
    assert.equal(result.source, 'rule-only-fallback');
    assert.equal(result.reason, 'all-llm-models-unavailable');
  });

  test('writeText returns null when generateText throws an AbortError', async () => {
    _setProvider({
      generateObject: async () => ({ object: {}, usage: {} }),
      generateText: async () => {
        const e = new Error('The operation was aborted.');
        e.name = 'AbortError';
        throw e;
      },
    });

    const result = await writeText('hanging nudge');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 5. Primary fails, first fallback succeeds
// ---------------------------------------------------------------------------

describe('fallback chain: primary fails, first fallback succeeds', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'primary-model',
      LITELLM_FALLBACK_MODELS: 'fallback-model-1,fallback-model-2',
      LITELLM_TIMEOUT_MS: '8000',
      LITELLM_TOTAL_BUDGET_MS: '15000',
    });
  });

  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('classify returns result from first fallback when primary fails', async () => {
    const callLog = [];

    _setProvider({
      generateObject: async ({ model }) => {
        // model is null when using injected provider - track calls by callLog index
        callLog.push('call');
        if (callLog.length === 1) {
          // Primary attempt
          const e = new Error('Service unavailable');
          e.name = 'APICallError';
          throw e;
        }
        // First fallback succeeds
        return {
          object: { label: 'REVIEW', confidence: 0.7, rationale: 'Fallback model response' },
          usage: { totalTokens: 30 },
        };
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('suspicious transaction');

    assert.ok(result !== null, 'result should not be null');
    assert.ok(!result.source, 'should not be rule-only sentinel');
    assert.equal(result.label, 'REVIEW');
    assert.equal(result.confidence, 0.7);
    assert.equal(result.rationale, 'Fallback model response');
    assert.ok(typeof result.latencyMs === 'number', 'latencyMs should be a number');
    assert.equal(callLog.length, 2, 'should have made exactly 2 attempts');
  });

  test('writeText returns result from first fallback when primary fails', async () => {
    const callLog = [];

    _setProvider({
      generateObject: async () => ({ object: {}, usage: {} }),
      generateText: async () => {
        callLog.push('call');
        if (callLog.length === 1) {
          const e = new Error('Model overloaded');
          e.name = 'APICallError';
          throw e;
        }
        return { text: 'Redeem your points for a free night.', usage: { totalTokens: 15 } };
      },
    });

    const result = await writeText('loyalty offer nudge');

    assert.ok(result !== null, 'result should not be null');
    assert.equal(result.text, 'Redeem your points for a free night.');
    assert.equal(callLog.length, 2, 'should have made exactly 2 attempts');
  });
});

// ---------------------------------------------------------------------------
// 6. All models fail - rule-only fallback sentinel is returned from classify
// ---------------------------------------------------------------------------

describe('all models fail', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'primary-model',
      LITELLM_FALLBACK_MODELS: 'fallback-model-1,fallback-model-2',
      LITELLM_TIMEOUT_MS: '8000',
      LITELLM_TOTAL_BUDGET_MS: '15000',
    });
  });

  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('classify returns rule-only sentinel when all three models fail', async () => {
    const callLog = [];

    _setProvider({
      generateObject: async () => {
        callLog.push('call');
        const e = new Error('All models down');
        e.name = 'NetworkError';
        throw e;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('high risk event');

    assert.ok(result !== null, 'result should not be null');
    assert.equal(result.source, 'rule-only-fallback');
    assert.equal(result.reason, 'all-llm-models-unavailable');
    assert.equal(callLog.length, 3, 'should have attempted all 3 models');
  });

  test('writeText returns null when all models fail', async () => {
    _setProvider({
      generateObject: async () => ({ object: {}, usage: {} }),
      generateText: async () => {
        const e = new Error('All models down');
        e.name = 'NetworkError';
        throw e;
      },
    });

    const result = await writeText('nudge text');
    assert.equal(result, null, 'writeText should return null when all models fail');
  });
});

// ---------------------------------------------------------------------------
// 7. Total budget exhausted - stops trying even if fallbacks remain
// ---------------------------------------------------------------------------

describe('total budget exhausted', () => {
  let originalError;
  let errorLines;

  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'primary-model',
      LITELLM_FALLBACK_MODELS: 'fallback-model-1,fallback-model-2',
      LITELLM_TIMEOUT_MS: '8000',
      LITELLM_TOTAL_BUDGET_MS: '1', // 1ms budget - immediately exhausted after first attempt
    });

    originalError = console.error;
    errorLines = [];
    console.error = (...args) => errorLines.push(args.join(' '));
  });

  after(() => {
    console.error = originalError;
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('classify stops after primary when budget is exhausted and returns rule-only sentinel', async () => {
    const callLog = [];

    _setProvider({
      generateObject: async () => {
        callLog.push('call');
        // Add a small delay to ensure budget is consumed
        await new Promise((resolve) => setTimeout(resolve, 5));
        const e = new Error('Primary failed');
        e.name = 'APICallError';
        throw e;
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('budget test prompt');

    assert.ok(result !== null);
    assert.equal(result.source, 'rule-only-fallback');
    assert.equal(result.reason, 'all-llm-models-unavailable');
    // With a 1ms budget that was consumed by the primary attempt (5ms delay),
    // only 1 call should have been made (the budget check happens before each model)
    // The primary model runs first (no budget check before it since elapsed=0 at start),
    // then the budget is checked before fallback-model-1 and it's exhausted.
    assert.ok(callLog.length >= 1, 'at least one attempt was made');
    assert.ok(callLog.length <= 2, 'budget should have cut off remaining fallbacks');
  });
});

// ---------------------------------------------------------------------------
// 8. Fallback timeout triggers switch to next model
// ---------------------------------------------------------------------------

describe('timeout triggers fallback', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'primary-model',
      LITELLM_FALLBACK_MODELS: 'fallback-model-1',
      LITELLM_TIMEOUT_MS: '8000',
      LITELLM_TOTAL_BUDGET_MS: '15000',
    });
  });

  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('classify falls through to fallback when primary throws TimeoutError', async () => {
    const callLog = [];

    _setProvider({
      generateObject: async () => {
        callLog.push('call');
        if (callLog.length === 1) {
          const e = new Error('Timeout');
          e.name = 'TimeoutError';
          throw e;
        }
        return {
          object: { label: 'BLOCK', confidence: 0.99, rationale: 'Fallback caught it' },
          usage: {},
        };
      },
      generateText: async () => ({ text: '', usage: {} }),
    });

    const result = await classify('late night login anomaly');

    assert.ok(result !== null);
    assert.ok(!result.source, 'should not be rule-only sentinel');
    assert.equal(result.label, 'BLOCK');
    assert.equal(callLog.length, 2, 'should have tried primary then fallback');
  });
});
