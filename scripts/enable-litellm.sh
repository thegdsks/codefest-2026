#!/usr/bin/env bash
#
# scripts/enable-litellm.sh
#
# One-shot helper: sets LITELLM_BASE_URL and LITELLM_API_KEY on the deployed
# signal-force-runtime Lambda alongside the existing env vars, then verifies
# the AI Assist endpoint flips out of the AI_UNAVAILABLE degraded state.
#
# Usage:
#   ./scripts/enable-litellm.sh <base-url> <api-key> [model]
#
# Example:
#   ./scripts/enable-litellm.sh https://litellm.example.com/v1 sk-...abc claude-haiku-4-5
#
# Notes:
#   - LITELLM_MODEL defaults to claude-haiku-4-5 if not passed.
#   - The script preserves every other env var on the function by reading the
#     current configuration first and merging.
#   - Re-running this script with the same args is a no-op once propagated.
#   - The next `cdk deploy signal-force-runtime` will revert these variables
#     unless CDK is updated to inject them (see TODO at end of script).
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
FUNCTION_NAME="${FUNCTION_NAME:-signal-force-runtime-ApiLambda91D2282D-tv45G7vAnQvP}"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <base-url> <api-key> [model]"
  exit 1
fi

BASE_URL="$1"
API_KEY="$2"
MODEL="${3:-claude-haiku-4-5}"

echo "[enable-litellm] Reading current env vars on $FUNCTION_NAME..."
CURRENT=$(aws lambda get-function-configuration \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --query "Environment.Variables" \
  --output json)

if [[ -z "$CURRENT" || "$CURRENT" == "null" ]]; then
  echo "[enable-litellm] ERROR: could not read current function config"
  exit 1
fi

MERGED=$(echo "$CURRENT" | python3 -c "
import json, sys
v = json.load(sys.stdin)
v['LITELLM_BASE_URL'] = '$BASE_URL'
v['LITELLM_API_KEY']  = '$API_KEY'
v['LITELLM_MODEL']    = '$MODEL'
print(json.dumps({'Variables': v}))
")

echo "[enable-litellm] Updating function configuration..."
aws lambda update-function-configuration \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --environment "$MERGED" \
  > /dev/null

echo "[enable-litellm] Waiting for Lambda to finish updating..."
aws lambda wait function-updated \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME"

API_URL="${API_URL:-https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com}"
BASIC=$(printf "demoClient:demoSecret" | base64)

echo "[enable-litellm] Probing /admin/rules/ai-suggest..."
RESPONSE=$(curl -sS -X POST "$API_URL/admin/rules/ai-suggest" \
  -H "Authorization: Basic $BASIC" \
  -H "Content-Type: application/json" \
  -d '{"description":"When user dwells on points balance for more than 8 seconds, show a banner suggesting redemption"}')

if echo "$RESPONSE" | grep -q '"AI_UNAVAILABLE"'; then
  echo "[enable-litellm] FAIL: AI Assist still returns AI_UNAVAILABLE."
  echo "[enable-litellm] Check CloudWatch logs for SignalForce/RuleAiSuggest EMF metrics."
  echo "Response: $RESPONSE"
  exit 2
fi

if echo "$RESPONSE" | grep -q '"data"'; then
  echo "[enable-litellm] OK: AI Assist returned a rule draft."
  echo "Response (first 400 chars): ${RESPONSE:0:400}"
else
  echo "[enable-litellm] UNEXPECTED response shape:"
  echo "$RESPONSE"
  exit 3
fi

# TODO: To survive CDK redeploys, mirror these three env vars onto the
# Lambda environment block in infra/cdk/lib/runtime-stack.ts. Easiest path:
# read from Parameter Store via ssm.StringParameter.valueForStringParameter
# at synth time, fall back to undefined if the parameter is missing.
