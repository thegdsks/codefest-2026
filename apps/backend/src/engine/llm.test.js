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
// The module is required after each env manipulation because readConfig()
// reads process.env at call time. No module cache tricks needed.
// ---------------------------------------------------------------------------

const { classify, writeText } = require('./llm.js');

// ---------------------------------------------------------------------------
// 1. Missing env vars - both methods must return null without fetching
// ---------------------------------------------------------------------------

describe('missing env vars', () => {
  before(() => clearLiteLLMEnv());
  after(() => clearLiteLLMEnv());

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
// 2. Successful classify - stub fetch, check returned shape
// ---------------------------------------------------------------------------

describe('successful classify', () => {
  let originalFetch;

  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
      LITELLM_MODEL: 'claude-haiku-4-5',
    });
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
    clearLiteLLMEnv();
  });

  test('returns correct shape with latencyMs as number', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ label: 'high-risk', confidence: 0.92 }),
            },
          },
        ],
      }),
    });

    const result = await classify('User logged in from 3 different countries in 2 minutes.');

    assert.ok(result !== null, 'expected a non-null result');
    assert.equal(result.label, 'high-risk');
    assert.equal(result.confidence, 0.92);
    assert.ok(typeof result.raw === 'string', 'raw should be a string');
    assert.ok(typeof result.latencyMs === 'number', 'latencyMs should be a number');
    assert.ok(result.latencyMs >= 0, 'latencyMs should be non-negative');
    assert.equal(result.model, 'claude-haiku-4-5');
  });

  test('writeText returns correct shape', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Earn 500 bonus points on your next stay.',
            },
          },
        ],
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
// 3. Non-2xx response - must return null, must not throw
// ---------------------------------------------------------------------------

describe('non-2xx response', () => {
  let originalFetch;

  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
    });
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
    clearLiteLLMEnv();
  });

  test('classify returns null on 500', async () => {
    global.fetch = async () => ({ ok: false, status: 500 });
    const result = await classify('test prompt');
    assert.equal(result, null);
  });

  test('writeText returns null on 401', async () => {
    global.fetch = async () => ({ ok: false, status: 401 });
    const result = await writeText('test nudge');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Timeout simulation - fetch hangs beyond 1500 ms, must return null
// ---------------------------------------------------------------------------

describe('timeout handling', () => {
  let originalFetch;

  before(() => {
    clearLiteLLMEnv();
    setEnv({
      LITELLM_BASE_URL: 'https://fake-litellm.example.com',
      LITELLM_API_KEY: 'sk-test',
    });
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
    clearLiteLLMEnv();
  });

  test('classify returns null when fetch never resolves within timeout', async () => {
    // Simulate a hanging request that respects the abort signal
    global.fetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
        // Never resolves on its own
      });

    const start = Date.now();
    const result = await classify('hanging prompt');
    const elapsed = Date.now() - start;

    assert.equal(result, null);
    // Should abort after ~1500ms (allow generous buffer for CI jitter)
    assert.ok(elapsed < 4000, `timed out too slowly: ${elapsed}ms`);
    assert.ok(elapsed >= 1400, `aborted too quickly: ${elapsed}ms`);
  });

  test('writeText returns null when fetch never resolves within timeout', async () => {
    global.fetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });

    const result = await writeText('hanging nudge');
    assert.equal(result, null);
  });
});
