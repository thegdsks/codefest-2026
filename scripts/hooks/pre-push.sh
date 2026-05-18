#!/bin/sh
# pre-push: run workspace-scoped checks with timing.
# Blocks on real build / typecheck failures.
# After all checks pass, writes a report to .git/last-prepush-report.md
# and posts a comment on the open PR for the current branch (if any).

START_NS=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
elapsed_ms() {
  END_NS=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
  printf '%d' "$(( (END_NS - START_NS) / 1000000 ))"
}

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE_REF="origin/$CURRENT_BRANCH"

if git rev-parse --verify "$REMOTE_REF" >/dev/null 2>&1; then
  RANGE="$REMOTE_REF..HEAD"
else
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    RANGE="origin/main..HEAD"
  else
    RANGE="HEAD"
  fi
fi

CHANGED=$(git diff --name-only $RANGE 2>/dev/null)
RAN=0
REPORT_ROWS=""

run_step() {
  STEP_NAME="$1"
  STEP_START=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
  printf '[pre-push] %s ... ' "$STEP_NAME"
  shift
  if "$@" >/tmp/signal-prepush.log 2>&1; then
    STEP_END=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
    STEP_MS=$(( (STEP_END - STEP_START) / 1000000 ))
    printf 'ok (%dms)\n' "$STEP_MS"
    REPORT_ROWS="${REPORT_ROWS}| ${STEP_NAME} | ok | ${STEP_MS}ms |
"
    RAN=$((RAN + 1))
  else
    printf 'FAILED\n'
    cat /tmp/signal-prepush.log >&2
    printf '\n[pre-push] %s failed. Fix the error above and push again.\n' "$STEP_NAME" >&2
    exit 1
  fi
}

if printf '%s' "$CHANGED" | grep -q '^apps/frontend/'; then
  run_step "frontend typecheck" sh -c 'cd apps/frontend && npx tsc --noEmit'
  run_step "frontend build" sh -c 'cd apps/frontend && npm run build'
fi

if printf '%s' "$CHANGED" | grep -q '^infra/cdk/'; then
  run_step "cdk typecheck" sh -c 'cd infra/cdk && npx tsc --noEmit'
  run_step "cdk synth" sh -c 'cd infra/cdk && npx cdk synth --quiet'
fi

if printf '%s' "$CHANGED" | grep -q '^apps/backend/'; then
  run_step "backend syntax" node -c apps/backend/src/handler.js
fi

TOTAL_MS=$(elapsed_ms)

if [ "$RAN" -eq 0 ]; then
  printf '[pre-push] no workspace-relevant changes, skipping (%dms total)\n' "$TOTAL_MS"
  exit 0
fi

printf '[pre-push] %d step(s) passed in %dms total\n' "$RAN" "$TOTAL_MS"

# Write a report file. Reusable for gh pr create --body-file or manual inclusion.
GIT_DIR=$(git rev-parse --git-dir)
REPORT_FILE="${GIT_DIR}/last-prepush-report.md"
COMMIT_SHA=$(git rev-parse --short HEAD)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

{
  printf '## Pre-push report\n\n'
  printf 'Branch: `%s`\n' "$CURRENT_BRANCH"
  printf 'Commit: `%s`\n' "$COMMIT_SHA"
  printf 'Timestamp: %s\n\n' "$TIMESTAMP"
  printf '| Step | Status | Duration |\n'
  printf '|---|---|---|\n'
  printf '%s' "$REPORT_ROWS"
  printf '| **Total** | **%d of %d passed** | **%dms** |\n' "$RAN" "$RAN" "$TOTAL_MS"
} > "$REPORT_FILE"

# Post the report as a comment on the open PR for this branch, if any.
# Skipped when on main, when gh is not installed, or when no PR exists yet.
if command -v gh >/dev/null 2>&1 && [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
  PR_NUMBER=$(gh pr view "$CURRENT_BRANCH" --json number --jq '.number' 2>/dev/null || true)
  if [ -n "$PR_NUMBER" ] && [ "$PR_NUMBER" != "null" ]; then
    if gh pr comment "$PR_NUMBER" --body-file "$REPORT_FILE" >/dev/null 2>&1; then
      printf '[pre-push] posted report to PR #%s\n' "$PR_NUMBER"
    else
      printf '[pre-push] could not post report to PR #%s (continuing)\n' "$PR_NUMBER"
    fi
  fi
fi

exit 0
