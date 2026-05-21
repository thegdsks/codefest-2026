#!/usr/bin/env bash
# deploy-backend.sh - Deploy the signal-force backend (Lambda + API Gateway + DynamoDB) via CDK.
#
# Usage:
#   ./scripts/deploy-backend.sh              # normal run, refuses on dirty working tree
#   ./scripts/deploy-backend.sh --allow-dirty  # skip the dirty-tree check
#
# Exit codes:
#   0  success
#   1  test failure
#   2  missing prerequisite
#   3  CDK deploy failure

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOW_DIRTY=0

for arg in "$@"; do
  if [[ "$arg" == "--allow-dirty" ]]; then
    ALLOW_DIRTY=1
  fi
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf '\033[1;34m[deploy-backend]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[deploy-backend]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[deploy-backend]\033[0m %s\n' "$*" >&2; }
die()   { printf '\033[1;31m[deploy-backend]\033[0m ERROR: %s\n' "$*" >&2; exit "${2:-1}"; }

# ---------------------------------------------------------------------------
# 1. Prerequisite checks
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

MISSING=()
for cmd in node aws cdk jq; do
  if ! command -v "$cmd" &>/dev/null; then
    MISSING+=("$cmd")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  for m in "${MISSING[@]}"; do
    case "$m" in
      node) warn "node is not on PATH. Install from https://nodejs.org (Node 20+ required)." ;;
      aws)  warn "aws CLI is not on PATH. Install from https://aws.amazon.com/cli/." ;;
      cdk)  warn "cdk is not on PATH. Run: npm install -g aws-cdk" ;;
      jq)   warn "jq is not on PATH. Install from https://stedolan.github.io/jq/ or: brew install jq" ;;
    esac
  done
  die "Missing prerequisites: ${MISSING[*]}" 2
fi

# ---------------------------------------------------------------------------
# 2. AWS credentials check
# ---------------------------------------------------------------------------
if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  die "No AWS credentials found. Set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY before running." 2
fi

# Quick sanity-check that the credentials actually work.
if ! aws sts get-caller-identity &>/dev/null; then
  die "AWS credentials are set but 'aws sts get-caller-identity' failed. Check your profile or key pair." 2
fi

ok "Prerequisites OK. AWS caller: $(aws sts get-caller-identity --query 'Arn' --output text)"

# ---------------------------------------------------------------------------
# 3. Dirty working tree check
# ---------------------------------------------------------------------------
if [[ "$ALLOW_DIRTY" -eq 0 ]]; then
  if ! git -C "$REPO_ROOT" diff --quiet HEAD 2>/dev/null || \
     [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | grep -v '^??')" ]]; then
    die "Working tree has uncommitted changes. Commit or stash first, or pass --allow-dirty to override." 2
  fi
fi

# ---------------------------------------------------------------------------
# 4. Install CDK dependencies if needed
# ---------------------------------------------------------------------------
CDK_DIR="$REPO_ROOT/infra/cdk"
if [[ ! -d "$CDK_DIR/node_modules" ]]; then
  info "Installing CDK dependencies..."
  npm install --prefix "$CDK_DIR"
fi

# ---------------------------------------------------------------------------
# 5. Install backend app dependencies
# ---------------------------------------------------------------------------
info "Installing backend workspace dependencies..."
npm --workspace=apps/backend ci --prefix "$REPO_ROOT"

# ---------------------------------------------------------------------------
# 6. Run backend tests
# ---------------------------------------------------------------------------
info "Running backend tests..."
if ! npm test --workspace=apps/backend --prefix "$REPO_ROOT"; then
  die "Backend tests failed. Fix failing tests before deploying." 1
fi

# ---------------------------------------------------------------------------
# 7. CDK deploy
# ---------------------------------------------------------------------------
CDK_OUTPUTS_FILE="$REPO_ROOT/infra/cdk/cdk-outputs.json"
info "Running cdk deploy (this takes 2-5 minutes on first run)..."

# Warn if LITELLM vars are absent - Lambda will deploy without them and the AI
# Assist feature will be silently disabled.
if [[ -z "${LITELLM_BASE_URL:-}" || -z "${LITELLM_API_KEY:-}" ]]; then
  warn "LITELLM_BASE_URL or LITELLM_API_KEY is not set in the environment."
  warn "The Lambda will deploy without them - AI Assist will be disabled."
  warn "Set them before running this script to enable LiteLLM-powered classification."
fi

CDK_DEPLOY_LOG="$(mktemp)"
if ! (cd "$CDK_DIR" && \
  CDK_NAG=off \
  cdk deploy \
    --all \
    --require-approval never \
    --outputs-file "$CDK_OUTPUTS_FILE" \
    2>&1 | tee "$CDK_DEPLOY_LOG"); then
  warn "CDK deploy failed. Last 40 lines of output:"
  tail -40 "$CDK_DEPLOY_LOG" >&2
  # Try to extract a useful hint from common errors
  if grep -q "UPDATE_ROLLBACK" "$CDK_DEPLOY_LOG" 2>/dev/null; then
    warn "Hint: Stack is in UPDATE_ROLLBACK_COMPLETE state. Run: cd infra/cdk && cdk deploy --rollback"
  elif grep -q "bootstrap" "$CDK_DEPLOY_LOG" 2>/dev/null; then
    warn "Hint: Account/region may not be bootstrapped. Run: cd infra/cdk && cdk bootstrap"
  elif grep -q "AccessDenied\|is not authorized" "$CDK_DEPLOY_LOG" 2>/dev/null; then
    warn "Hint: IAM permissions error. Verify your AWS identity has CDK deploy permissions."
  elif grep -q "AlreadyExistsException\|already exists" "$CDK_DEPLOY_LOG" 2>/dev/null; then
    warn "Hint: A resource with the same name already exists. Check for stack drift in the AWS console."
  fi
  rm -f "$CDK_DEPLOY_LOG"
  exit 3
fi
rm -f "$CDK_DEPLOY_LOG"

# ---------------------------------------------------------------------------
# 8. Parse API URL from cdk-outputs.json
# ---------------------------------------------------------------------------
STACK_NAME="signal-force-runtime"

if [[ ! -f "$CDK_OUTPUTS_FILE" ]]; then
  die "cdk-outputs.json not found at $CDK_OUTPUTS_FILE. Deploy may have succeeded without writing outputs." 3
fi

API_URL="$(jq -r --arg stack "$STACK_NAME" '.[$stack].ApiUrl // empty' "$CDK_OUTPUTS_FILE")"

if [[ -z "$API_URL" ]]; then
  warn "Could not find ApiUrl in cdk-outputs.json under stack '$STACK_NAME'."
  warn "Contents of cdk-outputs.json:"
  jq . "$CDK_OUTPUTS_FILE" >&2
  die "Could not extract API URL from CDK outputs." 3
fi

# Strip trailing slash for consistency
API_URL="${API_URL%/}"

# ---------------------------------------------------------------------------
# 9. Write API URL to frontend env file
# ---------------------------------------------------------------------------
FRONTEND_ENV_FILE="$REPO_ROOT/apps/frontend/.env.production.local"
info "Writing API URL to $FRONTEND_ENV_FILE..."

# Preserve any other vars that may already be in the file
if [[ -f "$FRONTEND_ENV_FILE" ]]; then
  # Remove existing NEXT_PUBLIC_API_BASE_URL line if present
  tmp="$(mktemp)"
  grep -v '^NEXT_PUBLIC_API_BASE_URL=' "$FRONTEND_ENV_FILE" > "$tmp" || true
  mv "$tmp" "$FRONTEND_ENV_FILE"
fi

printf 'NEXT_PUBLIC_API_BASE_URL=%s\n' "$API_URL" >> "$FRONTEND_ENV_FILE"
ok "Wrote NEXT_PUBLIC_API_BASE_URL=$API_URL"

# ---------------------------------------------------------------------------
# 10. Summary
# ---------------------------------------------------------------------------
printf '\n'
ok "=========================================="
ok "  Backend deploy complete"
ok "=========================================="
printf '  API URL: \033[1;36m%s\033[0m\n' "$API_URL"
printf '\n'
printf '  Next step - deploy the frontend:\n'
printf '    \033[1m./scripts/deploy-frontend.sh\033[0m\n'
printf '\n'
printf '  Or test the API locally:\n'
printf '    \033[1mcurl %s/health\033[0m\n' "$API_URL"
printf '\n'
