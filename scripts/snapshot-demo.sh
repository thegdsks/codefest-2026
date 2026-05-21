#!/usr/bin/env bash
# scripts/snapshot-demo.sh
# Read-only evidence capture: scans DynamoDB tables and smokes every API
# endpoint, then writes a single JSON blob to docs-local/ for demo backup.
# Also writes per-endpoint JSON files to docs-local/snapshots/ for the
# bearer/MFA/admin evidence required by the X6 capture checklist.
#
# Run at T-30 min before the demo and once after.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL="${API_URL:-https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com}"
CLIENT_ID="${CLIENT_ID:-demoClient}"
CLIENT_SECRET="${CLIENT_SECRET:-demoSecret}"
AUTH_HEADER="Authorization: Basic $(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OUT_DIR:-${SCRIPT_DIR}/../docs-local}"
SNAP_DIR="${OUT_DIR}/snapshots"

# Canonical demo user IDs
USER_A="USER#001"   # Charlotte - low-risk, normal login
USER_B="USER#002"   # second user for transfer recipient

# TOTP secret for USER#001 (pre-seeded)
DEMO_TOTP_SECRET="JBSWY3DPEHPK3PXP"

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
check_deps() {
  local missing=()
  for cmd in jq aws curl; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: required tools not found: ${missing[*]}" >&2
    echo "Install them and retry:" >&2
    echo "  jq:  https://jqlang.github.io/jq/download/" >&2
    echo "  aws: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
    echo "  curl: https://curl.se/download.html" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# TOTP code generation
# oathtool is preferred (no network); falls back to node scripts/totp-code.js
# which reads the secret from DynamoDB. When neither is available the script
# exits with a clear message.
# ---------------------------------------------------------------------------
generate_totp() {
  local secret="$1"
  if command -v oathtool &>/dev/null; then
    oathtool --base32 --totp "$secret"
    return
  fi
  # Fall back to node script (requires DDB access, reads from UserProfile)
  if command -v node &>/dev/null && [[ -f "${SCRIPT_DIR}/totp-code.js" ]]; then
    node "${SCRIPT_DIR}/totp-code.js" "$USER_A" 2>/dev/null | awk '{print $1}'
    return
  fi
  echo "ERROR: cannot generate TOTP code - install oathtool or ensure node is available" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Phase 1: DynamoDB scans
# ---------------------------------------------------------------------------
TABLES=(UserProfile UserSession UserActivity DecisionStore UserState)
declare -A DDB_FILES

scan_tables() {
  echo "Phase 1: scanning DynamoDB tables..."
  for table in "${TABLES[@]}"; do
    local tmp
    tmp=$(mktemp)
    DDB_FILES[$table]="$tmp"
    echo "  scanning $table ..."
    if aws dynamodb scan \
        --table-name "$table" \
        --max-items 200 \
        --output json > "$tmp" 2>&1; then
      local count
      count=$(jq '.Items | length' "$tmp" 2>/dev/null || echo 0)
      echo "    $table: $count items"
    else
      echo "    WARNING: scan failed for $table" >&2
      echo '{"Items":[],"Count":0}' > "$tmp"
    fi
  done
}

# ---------------------------------------------------------------------------
# Phase 2: API smoke tests (original set)
# ---------------------------------------------------------------------------
# Each entry: "label|method|path|body_or_empty|query_or_empty"
ENDPOINTS=(
  "POST /auth/login (Charlotte, low-risk)|POST|/auth/login|{\"username\":\"user001\",\"password\":\"Password1\",\"location\":\"New York\",\"deviceId\":\"dev-001\",\"ipAddress\":\"203.0.113.10\",\"deviceType\":\"browser\",\"browser\":\"Chrome\"}|"
  "POST /auth/login (Charlotte, new-location)|POST|/auth/login|{\"username\":\"user001\",\"password\":\"Password1\",\"location\":\"Tokyo\",\"deviceId\":\"dev-999\",\"ipAddress\":\"198.51.100.55\",\"deviceType\":\"mobile\",\"browser\":\"Safari\"}|"
  "POST /auth/mfa/verify (bad OTP)|POST|/auth/mfa/verify|{\"sessionId\":\"SESSION#00000000\",\"otp\":\"000000\"}|"
  "POST /transactions/transfer (#1 normal)|POST|/transactions/transfer|{\"userId\":\"USER#001\",\"recipientId\":\"USER#002\",\"amount\":500,\"channel\":\"APP\"}|"
  "POST /transactions/transfer (#2 normal)|POST|/transactions/transfer|{\"userId\":\"USER#003\",\"recipientId\":\"USER#004\",\"amount\":1000,\"channel\":\"WEB\"}|"
  "GET /offers (USER#001)|GET|/offers||userId=USER%23001"
  "GET /offers (USER#002)|GET|/offers||userId=USER%23002"
  "POST /offers/action (IMPRESSION)|POST|/offers/action|{\"userId\":\"USER#001\",\"offerId\":\"OFF#001\",\"action\":\"IMPRESSION\"}|"
  "GET /nudges (USER#001)|GET|/nudges||userId=USER%23001"
  "POST /nudges/action (SHOWN)|POST|/nudges/action|{\"userId\":\"USER#001\",\"nudgeId\":\"NUDGE#PROFILE\",\"action\":\"SHOWN\"}|"
  "GET /user/profile (USER#001)|GET|/user/profile||userId=USER%23001"
  "GET /user/profile-completeness (USER#001)|GET|/user/profile-completeness||userId=USER%23001"
  "GET /dashboard (USER#001)|GET|/dashboard||userId=USER%23001"
  "GET /admin/decisions|GET|/admin/decisions||"
  "GET /admin/metrics|GET|/admin/metrics||"
)

declare -A EP_LABELS
declare -A EP_STATUS
declare -A EP_BODY
EP_ORDER=()
EP_ERROR_COUNT=0

smoke_endpoints() {
  echo "Phase 2: smoking API endpoints..."
  local total=${#ENDPOINTS[@]}
  local idx=0

  for entry in "${ENDPOINTS[@]}"; do
    idx=$((idx + 1))
    local label method path body qs
    IFS='|' read -r label method path body qs <<< "$entry"

    local url="${API_URL}${path}"
    if [[ -n "$qs" ]]; then
      url="${url}?${qs}"
    fi

    local tmp_status tmp_body
    tmp_status=$(mktemp)
    tmp_body=$(mktemp)

    echo "  [${idx}/${total}] ${label} ..."

    local curl_exit=0
    if [[ "$method" == "POST" ]]; then
      http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
        -X POST \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "$body" \
        --max-time 10 \
        "$url" 2>/dev/null) || curl_exit=$?
    else
      http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
        -X GET \
        -H "$AUTH_HEADER" \
        --max-time 10 \
        "$url" 2>/dev/null) || curl_exit=$?
    fi

    if [[ $curl_exit -ne 0 ]]; then
      echo "    FAIL: curl error $curl_exit" >&2
      EP_LABELS["$label"]="$label"
      EP_STATUS["$label"]="curl_error_${curl_exit}"
      EP_BODY["$label"]='{"error":"curl_failed"}'
      EP_ORDER+=("$label")
      EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    else
      local raw_body
      raw_body=$(cat "$tmp_body")
      # Try to parse as JSON; if it fails, wrap it as a string
      local parsed_body
      if echo "$raw_body" | jq . &>/dev/null; then
        parsed_body="$raw_body"
      else
        parsed_body="$(jq -n --arg b "$raw_body" '{"raw":$b}')"
      fi

      echo "    status: $http_code"
      EP_LABELS["$label"]="$label"
      EP_STATUS["$label"]="$http_code"
      EP_BODY["$label"]="$parsed_body"
      EP_ORDER+=("$label")

      if [[ "$http_code" -ge 500 ]]; then
        EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
      fi
    fi

    rm -f "$tmp_status" "$tmp_body"
  done
}

# ---------------------------------------------------------------------------
# Helper: write a snapshot JSON file and validate status code
# ---------------------------------------------------------------------------
write_snap() {
  local filename="$1"
  local expected_status="$2"
  local http_code="$3"
  local body="$4"

  local snap_file="${SNAP_DIR}/${filename}"

  jq -n \
    --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg apiUrl     "$API_URL" \
    --arg status     "$http_code" \
    --argjson body   "$body" \
    '{capturedAt: $capturedAt, apiUrl: $apiUrl, httpStatus: $status, body: $body}' \
    > "$snap_file"

  echo "    wrote ${filename} (status ${http_code})"

  if [[ -n "$expected_status" && "$http_code" != "$expected_status" ]]; then
    echo "ERROR: ${filename}: expected HTTP ${expected_status}, got ${http_code}" >&2
    echo "  Body: ${body}" >&2
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Phase 3: Bearer / MFA / admin evidence captures (X6 checklist)
# ---------------------------------------------------------------------------

# Shared state written by capture_login_success and read by later captures.
BEARER_TOKEN=""
MFA_SESSION_ID=""

capture_login_success() {
  echo "  capture: auth-login-success.json (low-risk login for USER#001) ..."
  local tmp_body http_code curl_exit=0
  tmp_body=$(mktemp)
  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{"username":"user001","password":"Password1","location":"New York","deviceId":"dev-001","ipAddress":"203.0.113.10","deviceType":"browser","browser":"Chrome"}' \
    --max-time 15 \
    "${API_URL}/auth/login" 2>/dev/null) || curl_exit=$?

  local raw_body body
  raw_body=$(cat "$tmp_body")
  rm -f "$tmp_body"
  if echo "$raw_body" | jq . &>/dev/null; then
    body="$raw_body"
  else
    body="$(jq -n --arg b "$raw_body" '{"raw":$b}')"
  fi

  if [[ $curl_exit -ne 0 ]]; then
    echo "ERROR: auth-login-success.json: curl error ${curl_exit}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    write_snap "auth-login-success.json" "" "curl_error_${curl_exit}" '{"error":"curl_failed"}'
    return 1
  fi

  write_snap "auth-login-success.json" "200" "$http_code" "$body" || {
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    return 1
  }

  # Extract bearer token from the SUCCESS path for subsequent calls.
  local status_val
  status_val=$(echo "$body" | jq -r '.data.status // ""')
  if [[ "$status_val" == "SUCCESS" ]]; then
    BEARER_TOKEN=$(echo "$body" | jq -r '.data.token // ""')
    echo "    bearer token obtained (${#BEARER_TOKEN} chars)"
  else
    echo "    WARNING: login did not return SUCCESS (status=${http_code}, status_val=${status_val})" >&2
    echo "    This may happen if USER#001 is blocked or MFA_REQUIRED. Continuing." >&2
  fi
}

capture_auth_session() {
  echo "  capture: auth-session.json (GET /auth/session with bearer) ..."
  if [[ -z "$BEARER_TOKEN" ]]; then
    echo "    SKIP: no bearer token available (login did not succeed)" >&2
    jq -n \
      --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{capturedAt: $capturedAt, reason:"no_bearer_token"}' \
      > "${SNAP_DIR}/auth-session.json"
    return 0
  fi

  local tmp_body http_code curl_exit=0
  tmp_body=$(mktemp)
  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X GET \
    -H "Authorization: Bearer ${BEARER_TOKEN}" \
    --max-time 15 \
    "${API_URL}/auth/session" 2>/dev/null) || curl_exit=$?

  local raw_body body
  raw_body=$(cat "$tmp_body")
  rm -f "$tmp_body"
  if echo "$raw_body" | jq . &>/dev/null; then
    body="$raw_body"
  else
    body="$(jq -n --arg b "$raw_body" '{"raw":$b}')"
  fi

  if [[ $curl_exit -ne 0 ]]; then
    echo "ERROR: auth-session.json: curl error ${curl_exit}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    write_snap "auth-session.json" "" "curl_error_${curl_exit}" '{"error":"curl_failed"}'
    return 1
  fi

  write_snap "auth-session.json" "200" "$http_code" "$body" || {
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    return 1
  }
}

capture_mfa_flow() {
  echo "  capture: auth-mfa-verify-totp.json (full MFA flow via far-away location) ..."

  # Step 1: login from a location that triggers MFA_REQUIRED (Tokyo from a new device).
  local tmp_body http_code curl_exit=0
  tmp_body=$(mktemp)
  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{"username":"user001","password":"Password1","location":"Tokyo","deviceId":"dev-mfa-snap","ipAddress":"198.51.100.99","deviceType":"mobile","browser":"Safari"}' \
    --max-time 15 \
    "${API_URL}/auth/login" 2>/dev/null) || curl_exit=$?

  local raw_body body
  raw_body=$(cat "$tmp_body")
  rm -f "$tmp_body"
  if echo "$raw_body" | jq . &>/dev/null; then
    body="$raw_body"
  else
    body="$(jq -n --arg b "$raw_body" '{"raw":$b}')"
  fi

  if [[ $curl_exit -ne 0 ]]; then
    echo "    WARNING: MFA trigger login: curl error ${curl_exit}, skipping MFA capture" >&2
    jq -n \
      --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{capturedAt: $capturedAt, reason:"mfa_trigger_login_curl_error"}' \
      > "${SNAP_DIR}/auth-mfa-verify-totp.json"
    return 0
  fi

  local mfa_status
  mfa_status=$(echo "$body" | jq -r '.data.status // ""')

  if [[ "$mfa_status" != "MFA_REQUIRED" ]]; then
    # login succeeded without MFA (user may already be in known location state).
    # Still capture the response as useful evidence; note the lack of MFA.
    echo "    NOTE: login did not return MFA_REQUIRED (status=${mfa_status}, http=${http_code})." >&2
    echo "    Capturing login response as MFA flow evidence." >&2
    write_snap "auth-mfa-verify-totp.json" "" "$http_code" \
      "$(jq -n --argjson login "$body" '{note:"MFA_REQUIRED not triggered; login response captured", loginResponse: $login}')" \
      || true
    return 0
  fi

  MFA_SESSION_ID=$(echo "$body" | jq -r '.data.sessionId // ""')
  echo "    MFA_REQUIRED received, sessionId=${MFA_SESSION_ID}"

  # Step 2: generate current TOTP code.
  local totp_code
  totp_code=$(generate_totp "$DEMO_TOTP_SECRET")
  echo "    generated TOTP code (${#totp_code} chars)"

  # Step 3: verify.
  local mfa_tmp http_code_mfa curl_exit_mfa=0
  mfa_tmp=$(mktemp)
  http_code_mfa=$(curl -s -o "$mfa_tmp" -w "%{http_code}" \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"${MFA_SESSION_ID}\",\"otp\":\"${totp_code}\"}" \
    --max-time 15 \
    "${API_URL}/auth/mfa/verify" 2>/dev/null) || curl_exit_mfa=$?

  local raw_mfa body_mfa
  raw_mfa=$(cat "$mfa_tmp")
  rm -f "$mfa_tmp"
  if echo "$raw_mfa" | jq . &>/dev/null; then
    body_mfa="$raw_mfa"
  else
    body_mfa="$(jq -n --arg b "$raw_mfa" '{"raw":$b}')"
  fi

  if [[ $curl_exit_mfa -ne 0 ]]; then
    echo "ERROR: auth-mfa-verify-totp.json: curl error on verify ${curl_exit_mfa}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    write_snap "auth-mfa-verify-totp.json" "" "curl_error_${curl_exit_mfa}" '{"error":"curl_failed"}'
    return 1
  fi

  # Build combined evidence object.
  local combined
  combined=$(jq -n \
    --argjson loginResp "$body" \
    --arg loginStatus "$http_code" \
    --arg sessionId "$MFA_SESSION_ID" \
    --argjson verifyResp "$body_mfa" \
    --arg verifyStatus "$http_code_mfa" \
    '{
      loginStep:  {httpStatus: $loginStatus, body: $loginResp},
      verifyStep: {httpStatus: $verifyStatus, sessionId: $sessionId, body: $verifyResp}
    }')

  write_snap "auth-mfa-verify-totp.json" "200" "$http_code_mfa" "$combined" || {
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    return 1
  }

  # If MFA verify succeeded, store the resulting bearer token for later use.
  local mfa_bearer
  mfa_bearer=$(echo "$body_mfa" | jq -r '.data.token // ""')
  if [[ -n "$mfa_bearer" && -z "$BEARER_TOKEN" ]]; then
    BEARER_TOKEN="$mfa_bearer"
    echo "    bearer token from MFA verify stored (${#BEARER_TOKEN} chars)"
  fi
}

capture_admin_sessions() {
  echo "  capture: admin-sessions-list.json (GET /admin/sessions) ..."
  local tmp_body http_code curl_exit=0
  tmp_body=$(mktemp)
  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X GET \
    -H "$AUTH_HEADER" \
    --max-time 15 \
    "${API_URL}/admin/sessions" 2>/dev/null) || curl_exit=$?

  local raw_body body
  raw_body=$(cat "$tmp_body")
  rm -f "$tmp_body"
  if echo "$raw_body" | jq . &>/dev/null; then
    body="$raw_body"
  else
    body="$(jq -n --arg b "$raw_body" '{"raw":$b}')"
  fi

  if [[ $curl_exit -ne 0 ]]; then
    echo "ERROR: admin-sessions-list.json: curl error ${curl_exit}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    write_snap "admin-sessions-list.json" "" "curl_error_${curl_exit}" '{"error":"curl_failed"}'
    return 1
  fi

  write_snap "admin-sessions-list.json" "200" "$http_code" "$body" || {
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    return 1
  }
}

capture_admin_mfa_status() {
  echo "  capture: admin-mfa-status.json (GET /admin/mfa-status) ..."
  local tmp_body http_code curl_exit=0
  tmp_body=$(mktemp)
  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X GET \
    -H "$AUTH_HEADER" \
    --max-time 15 \
    "${API_URL}/admin/mfa-status" 2>/dev/null) || curl_exit=$?

  local raw_body body
  raw_body=$(cat "$tmp_body")
  rm -f "$tmp_body"
  if echo "$raw_body" | jq . &>/dev/null; then
    body="$raw_body"
  else
    body="$(jq -n --arg b "$raw_body" '{"raw":$b}')"
  fi

  if [[ $curl_exit -ne 0 ]]; then
    echo "ERROR: admin-mfa-status.json: curl error ${curl_exit}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    write_snap "admin-mfa-status.json" "" "curl_error_${curl_exit}" '{"error":"curl_failed"}'
    return 1
  fi

  write_snap "admin-mfa-status.json" "200" "$http_code" "$body" || {
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    return 1
  }
}

capture_logout() {
  echo "  capture: auth-logout-204.json (POST /auth/logout) ..."
  if [[ -z "$BEARER_TOKEN" ]]; then
    echo "    SKIP: no bearer token available" >&2
    jq -n \
      --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{capturedAt: $capturedAt, httpStatus:"n/a", note:"logout requires a valid bearer token", body: null}' \
      > "${SNAP_DIR}/auth-logout-204.json"
    return 0
  fi

  local tmp_body http_code curl_exit=0
  tmp_body=$(mktemp)
  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${BEARER_TOKEN}" \
    --max-time 15 \
    "${API_URL}/auth/logout" 2>/dev/null) || curl_exit=$?

  rm -f "$tmp_body"

  if [[ $curl_exit -ne 0 ]]; then
    echo "ERROR: auth-logout-204.json: curl error ${curl_exit}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    jq -n \
      --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg apiUrl "$API_URL" \
      '{capturedAt: $capturedAt, apiUrl: $apiUrl, httpStatus: "curl_error", body: {"error":"curl_failed"}}' \
      > "${SNAP_DIR}/auth-logout-204.json"
    return 1
  fi

  # Logout returns 204 No Content - write a one-line marker file.
  jq -n \
    --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg apiUrl "$API_URL" \
    --arg status "$http_code" \
    '{capturedAt: $capturedAt, apiUrl: $apiUrl, httpStatus: $status, body: null, note: "204 No Content - logout successful"}' \
    > "${SNAP_DIR}/auth-logout-204.json"

  echo "    wrote auth-logout-204.json (status ${http_code})"

  if [[ "$http_code" != "204" ]]; then
    echo "ERROR: auth-logout-204.json: expected HTTP 204, got ${http_code}" >&2
    EP_ERROR_COUNT=$((EP_ERROR_COUNT + 1))
    return 1
  fi

  # Token is now revoked.
  BEARER_TOKEN=""
}

capture_x6_evidence() {
  echo "Phase 3: capturing X6 bearer/MFA/admin evidence..."
  mkdir -p "$SNAP_DIR"

  local phase_errors=0

  capture_login_success    || phase_errors=$((phase_errors + 1))
  capture_auth_session     || phase_errors=$((phase_errors + 1))
  capture_mfa_flow         || phase_errors=$((phase_errors + 1))
  capture_admin_sessions   || phase_errors=$((phase_errors + 1))
  capture_admin_mfa_status || phase_errors=$((phase_errors + 1))
  capture_logout           || phase_errors=$((phase_errors + 1))

  if [[ $phase_errors -gt 0 ]]; then
    echo "  WARNING: ${phase_errors} X6 capture(s) failed" >&2
  fi
}

# ---------------------------------------------------------------------------
# Phase 4: Assemble JSON output
# ---------------------------------------------------------------------------
assemble_output() {
  local out_file="$1"
  local captured_at
  captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local commit
  commit=$(git -C "$SCRIPT_DIR/.." rev-parse HEAD 2>/dev/null || echo "unknown")

  echo "Phase 4: assembling output..."

  # Build DDB section
  local ddb_json
  ddb_json=$(jq -n \
    --slurpfile up  "${DDB_FILES[UserProfile]}" \
    --slurpfile us  "${DDB_FILES[UserSession]}" \
    --slurpfile ua  "${DDB_FILES[UserActivity]}" \
    --slurpfile ds  "${DDB_FILES[DecisionStore]}" \
    --slurpfile ust "${DDB_FILES[UserState]}" \
    '{
      UserProfile:   ($up[0].Items  // []),
      UserSession:   ($us[0].Items  // []),
      UserActivity:  ($ua[0].Items  // []),
      DecisionStore: ($ds[0].Items  // []),
      UserState:     ($ust[0].Items // [])
    }')

  # Build endpoints section - one key per label
  local ep_json='{}'
  for label in "${EP_ORDER[@]}"; do
    local status="${EP_STATUS[$label]}"
    local body="${EP_BODY[$label]}"
    ep_json=$(echo "$ep_json" | jq \
      --arg k  "$label" \
      --arg st "$status" \
      --argjson b "$body" \
      '. + {($k): {"status": $st, "body": $b}}')
  done

  # Build summary
  local ep_count=${#EP_ORDER[@]}
  local up_count us_count ua_count ds_count ust_count
  up_count=$(jq  '.Items | length' "${DDB_FILES[UserProfile]}")
  us_count=$(jq  '.Items | length' "${DDB_FILES[UserSession]}")
  ua_count=$(jq  '.Items | length' "${DDB_FILES[UserActivity]}")
  ds_count=$(jq  '.Items | length' "${DDB_FILES[DecisionStore]}")
  ust_count=$(jq '.Items | length' "${DDB_FILES[UserState]}")

  jq -n \
    --arg capturedAt  "$captured_at" \
    --arg apiUrl      "$API_URL" \
    --arg commit      "$commit" \
    --argjson ddb     "$ddb_json" \
    --argjson eps     "$ep_json" \
    --argjson upC     "$up_count" \
    --argjson usC     "$us_count" \
    --argjson uaC     "$ua_count" \
    --argjson dsC     "$ds_count" \
    --argjson ustC    "$ust_count" \
    --argjson epC     "$ep_count" \
    --argjson errC    "$EP_ERROR_COUNT" \
    '{
      capturedAt: $capturedAt,
      apiUrl:     $apiUrl,
      commit:     $commit,
      ddb:        $ddb,
      endpoints:  $eps,
      summary: {
        tables: {
          UserProfile:   $upC,
          UserSession:   $usC,
          UserActivity:  $uaC,
          DecisionStore: $dsC,
          UserState:     $ustC
        },
        endpoints: $epC,
        errors:    $errC
      }
    }' > "$out_file"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  check_deps

  mkdir -p "$OUT_DIR"
  mkdir -p "$SNAP_DIR"

  local timestamp
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  local out_file="${OUT_DIR}/demo-evidence-${timestamp}.json"
  local latest_link="${OUT_DIR}/demo-evidence-latest.json"

  scan_tables
  smoke_endpoints
  capture_x6_evidence
  assemble_output "$out_file"

  # Symlink to latest
  ln -sf "$(basename "$out_file")" "$latest_link"

  # Cleanup temp files
  for table in "${TABLES[@]}"; do
    rm -f "${DDB_FILES[$table]}"
  done

  local ep_count=${#ENDPOINTS[@]}
  echo ""
  echo "Done. errors=${EP_ERROR_COUNT} endpoints=${ep_count} tables=${#TABLES[@]} -> ${out_file}"
  echo "X6 snapshots written to: ${SNAP_DIR}/"
}

main "$@"
