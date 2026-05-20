#!/usr/bin/env bash
# scripts/snapshot-demo.sh
# Read-only evidence capture: scans DynamoDB tables and smokes every API
# endpoint, then writes a single JSON blob to docs-local/ for demo backup.
# Run at T-30 min before the demo and once after.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL="${API_URL:-https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com}"
AUTH_HEADER="Authorization: Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OUT_DIR:-${SCRIPT_DIR}/../../docs-local}"

# Canonical demo user IDs
USER_A="USER#001"   # Charlotte - low-risk, normal login
USER_B="USER#002"   # second user for transfer recipient

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
# Phase 2: API smoke tests
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
# Phase 3: Assemble JSON output
# ---------------------------------------------------------------------------
assemble_output() {
  local out_file="$1"
  local captured_at
  captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local commit
  commit=$(git -C "$SCRIPT_DIR/.." rev-parse HEAD 2>/dev/null || echo "unknown")

  echo "Phase 3: assembling output..."

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

  local timestamp
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  local out_file="${OUT_DIR}/demo-evidence-${timestamp}.json"
  local latest_link="${OUT_DIR}/demo-evidence-latest.json"

  scan_tables
  smoke_endpoints
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
}

main "$@"
