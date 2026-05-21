#!/usr/bin/env bash
# deploy-frontend.sh - Build and deploy the signal-force Next.js frontend to Vercel.
#
# Expects deploy-backend.sh to have been run first so that
# apps/frontend/.env.production.local contains NEXT_PUBLIC_API_BASE_URL.
#
# Usage:
#   ./scripts/deploy-frontend.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/apps/frontend"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf '\033[1;34m[deploy-frontend]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[deploy-frontend]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[deploy-frontend]\033[0m %s\n' "$*" >&2; }
die()   { printf '\033[1;31m[deploy-frontend]\033[0m ERROR: %s\n' "$*" >&2; exit "${2:-1}"; }

# ---------------------------------------------------------------------------
# 1. Prerequisite: vercel CLI
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v vercel &>/dev/null; then
  die "vercel CLI is not on PATH. Install it with: npm install -g vercel" 2
fi

if ! command -v node &>/dev/null; then
  die "node is not on PATH. Install from https://nodejs.org (Node 20+ required)." 2
fi

ok "Prerequisites OK. vercel: $(vercel --version 2>&1 | head -1)"

# ---------------------------------------------------------------------------
# 2. Check .env.production.local
# ---------------------------------------------------------------------------
ENV_FILE="$FRONTEND_DIR/.env.production.local"

if [[ ! -f "$ENV_FILE" ]]; then
  die "$(cat <<MSG
apps/frontend/.env.production.local not found.
Run ./scripts/deploy-backend.sh first to create it and populate NEXT_PUBLIC_API_BASE_URL.
MSG
  )" 2
fi

if ! grep -q '^NEXT_PUBLIC_API_BASE_URL=' "$ENV_FILE"; then
  die "$(cat <<MSG
NEXT_PUBLIC_API_BASE_URL is not set in $ENV_FILE.
Run ./scripts/deploy-backend.sh first to populate the API URL.
MSG
  )" 2
fi

API_URL="$(grep '^NEXT_PUBLIC_API_BASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
ok "Using NEXT_PUBLIC_API_BASE_URL=$API_URL"

# ---------------------------------------------------------------------------
# 3. Install root workspace dependencies if needed
# ---------------------------------------------------------------------------
if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  info "Installing workspace dependencies at repo root..."
  npm install --prefix "$REPO_ROOT"
fi

# ---------------------------------------------------------------------------
# 4. TypeScript type-check
# ---------------------------------------------------------------------------
info "Running TypeScript type-check..."
if ! npm run typecheck --workspace=apps/frontend --prefix "$REPO_ROOT"; then
  die "TypeScript type-check failed. Fix errors before deploying." 1
fi

# ---------------------------------------------------------------------------
# 5. Production build
# ---------------------------------------------------------------------------
info "Building production bundle..."
if ! npm run build --workspace=apps/frontend --prefix "$REPO_ROOT"; then
  die "Build failed. Fix build errors before deploying." 1
fi

# ---------------------------------------------------------------------------
# 6. Vercel deploy
# ---------------------------------------------------------------------------
info "Deploying to Vercel (--prod)..."
printf '\n'

DEPLOY_LOG="$(mktemp)"

# Vercel reads .env.production.local automatically for production builds.
# Pipe output to both the terminal and a log file so we can extract the URL.
if ! (cd "$FRONTEND_DIR" && vercel --prod 2>&1 | tee "$DEPLOY_LOG"); then
  warn "Vercel deploy failed. Last 20 lines:"
  tail -20 "$DEPLOY_LOG" >&2
  rm -f "$DEPLOY_LOG"
  die "vercel deploy exited non-zero." 1
fi

# Extract the production URL from vercel output
# Vercel prints the URL as the last non-empty line starting with https://
LIVE_URL="$(grep -Eo 'https://[a-zA-Z0-9._-]+\.vercel\.app' "$DEPLOY_LOG" | tail -1 || true)"
rm -f "$DEPLOY_LOG"

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
printf '\n'
ok "=========================================="
ok "  Frontend deploy complete"
ok "=========================================="
if [[ -n "$LIVE_URL" ]]; then
  printf '  Live URL: \033[1;36m%s\033[0m\n' "$LIVE_URL"
else
  warn "Could not parse the live URL from vercel output above."
  warn "Look for the production URL in the vercel output above."
fi
printf '\n'
printf '  Next step - smoke check (90 seconds):\n'
printf '    1. Open the live URL in a browser\n'
printf '    2. Log in with a seed user (e.g. usr_001 / demoSecret)\n'
printf '    3. Complete MFA with code: \033[1m123456\033[0m (static demo OTP)\n'
printf '    4. Trigger a transfer over $5000 and confirm the MFA gate fires\n'
printf '    5. Open Admin > Sessions and verify the session is visible\n'
printf '\n'
if [[ -n "$LIVE_URL" ]]; then
  printf '  Share this URL with judges: \033[1;36m%s\033[0m\n' "$LIVE_URL"
  printf '\n'
fi
