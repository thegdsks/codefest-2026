'use strict';

const { CFG } = require('./config');

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function json(statusCode, correlationId, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify({ correlationId: correlationId || '', ...payload }),
  };
}

function err(statusCode, correlationId, code, message) {
  return json(statusCode, correlationId, { error: { code, message } });
}

function getHeader(headers, name) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function basicAuthOk(event) {
  const auth = getHeader(event.headers, 'authorization');
  if (!auth || !auth.startsWith('Basic ')) return false;
  const b64 = auth.substring('Basic '.length).trim();
  let decoded;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch (_e) {
    return false;
  }
  const [id, secret] = decoded.split(':');
  return id === CFG.clientId && secret === CFG.clientSecret;
}

function parseBody(event) {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid JSON body' };
  }
}

function requireField(obj, field) {
  if (!obj || obj[field] === undefined || obj[field] === null || `${obj[field]}`.trim() === '') {
    throw { status: 400, code: 'VALIDATION_ERROR', message: `Missing required field: ${field}` };
  }
  return obj[field];
}

function qparam(event, key) {
  const v = event.queryStringParameters && event.queryStringParameters[key];
  if (!v || `${v}`.trim() === '')
    throw { status: 400, code: 'VALIDATION_ERROR', message: `Missing query parameter: ${key}` };
  return v;
}

module.exports = { nowSec, json, err, getHeader, basicAuthOk, parseBody, requireField, qparam };
