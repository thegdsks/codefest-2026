'use strict';

const { getStats: getBudgetStats } = require('../engine/budget');

// Read version once at module load.
const PACKAGE_VERSION = require('../../package.json').version;

function healthEndpoint() {
  const stats = getBudgetStats();
  const body = {
    status: 'ok',
    version: PACKAGE_VERSION,
    commit: process.env.GIT_COMMIT_SHA || 'unknown',
    engineLayer: {
      breakerOpen: stats.breakerOpen,
      callsInWindow: stats.callsInWindow,
      maxCalls: stats.maxCalls,
    },
    asOf: Date.now(),
  };
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify(body),
  };
}

module.exports = { healthEndpoint };
