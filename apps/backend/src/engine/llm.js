'use strict';

/**
 * Thin wrapper around the Marriott-hosted LiteLLM proxy.
 *
 * Required env vars:
 *   LITELLM_BASE_URL  - base URL of the proxy (no trailing slash)
 *   LITELLM_API_KEY   - Bearer token for the proxy
 *
 * Optional env vars:
 *   LITELLM_MODEL     - model name to pass in the request body (default: claude-haiku-4-5)
 *
 * If either required var is absent, both methods return null immediately
 * without attempting a network call. This allows the app to run in a
 * rules-only mode until credentials are available.
 *
 * Timeout: 1500 ms via AbortController. No retries. On timeout or
 * non-2xx response the method returns null and logs the failure class
 * and HTTP status (when available).
 */

const TIMEOUT_MS = 1500;
const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * Return a configured AbortController that fires after TIMEOUT_MS.
 * The caller is responsible for clearing the timer via the returned handle.
 *
 * @returns {{ controller: AbortController, timerId: NodeJS.Timeout }}
 */
function makeAbortController() {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { controller, timerId };
}

/**
 * Read the three env vars and return them, or null when required ones are missing.
 *
 * @returns {{ baseUrl: string, apiKey: string, model: string } | null}
 */
function readConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const model = process.env.LITELLM_MODEL || DEFAULT_MODEL;
  return { baseUrl, apiKey, model };
}

/**
 * POST to the LiteLLM chat completions endpoint and return the parsed body,
 * or null on any failure.
 *
 * @param {{ baseUrl: string, apiKey: string, model: string }} cfg
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object} extra - additional body fields (e.g. max_tokens, response_format)
 * @param {number} startMs - Date.now() captured before the call for latency tracking
 * @returns {Promise<{ body: object, latencyMs: number, model: string } | null>}
 */
async function callProxy(cfg, messages, extra, startMs) {
  const { controller, timerId } = makeAbortController();
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0,
        ...extra,
      }),
    });

    clearTimeout(timerId);
    const latencyMs = Date.now() - startMs;

    if (!res.ok) {
      console.error(`[llm] non-2xx response status=${res.status}`);
      return null;
    }

    const body = await res.json();
    return { body, latencyMs, model: cfg.model };
  } catch (err) {
    clearTimeout(timerId);
    const latencyMs = Date.now() - startMs;
    if (err.name === 'AbortError') {
      console.error(`[llm] request timed out after ${latencyMs}ms`);
    } else {
      console.error(`[llm] fetch error class=${err.name} message=${err.message}`);
    }
    return null;
  }
}

/**
 * Send a classification prompt to the LLM and parse the JSON response.
 *
 * The system message instructs the model to respond with a JSON object
 * containing `label` (string) and `confidence` (number 0-1). The raw
 * content string is also returned so callers can inspect or log it.
 *
 * @param {string} prompt - the user-facing text to classify
 * @param {object} [schema] - reserved for future schema enforcement; unused now
 * @returns {Promise<{
 *   label: string,
 *   confidence: number,
 *   raw: string,
 *   latencyMs: number,
 *   model: string
 * } | null>}
 */
async function classify(prompt, schema) {
  const cfg = readConfig();
  if (!cfg) return null;

  const startMs = Date.now();
  const systemMsg =
    'You are a classifier. Respond with valid JSON only. ' +
    'Schema: { "label": "<string>", "confidence": <number 0-1> }. ' +
    'No extra keys, no markdown fences.';

  const result = await callProxy(
    cfg,
    [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt },
    ],
    { response_format: { type: 'json_object' } },
    startMs
  );

  if (!result) return null;

  const raw = result.body.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    console.error('[llm] classify: response is not valid JSON, raw=' + raw.slice(0, 120));
    return null;
  }

  if (typeof parsed.label !== 'string' || typeof parsed.confidence !== 'number') {
    console.error('[llm] classify: unexpected shape in response');
    return null;
  }

  return {
    label: parsed.label,
    confidence: parsed.confidence,
    raw,
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

/**
 * Generate a short text string (for nudges, messages, etc.).
 *
 * @param {string} prompt - instruction describing the desired output
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<{ text: string, latencyMs: number, model: string } | null>}
 */
async function writeText(prompt, opts) {
  const cfg = readConfig();
  if (!cfg) return null;

  const maxTokens = opts?.maxTokens ?? 80;
  const startMs = Date.now();

  const result = await callProxy(
    cfg,
    [{ role: 'user', content: prompt }],
    { max_tokens: maxTokens },
    startMs
  );

  if (!result) return null;

  const text = result.body.choices?.[0]?.message?.content ?? '';

  return {
    text,
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

module.exports = { classify, writeText };
