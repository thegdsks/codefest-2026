#!/usr/bin/env bash
# scripts/snapshot-demo.test.sh
# Verifies that snapshot-demo.sh handles network failures gracefully and
# produces all expected snapshot files under docs-local/snapshots/.
#
# No external dependencies beyond bash, jq (same requirements as the main script).
#
# Exit 0 if the script handled errors gracefully.
# Exit 1 if the script crashed unexpectedly.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN="${SCRIPT_DIR}/snapshot-demo.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

# ---------------------------------------------------------------------------
# Dependency pre-check: jq must exist for the test itself to assemble results
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  fail "jq is required to run this test"
fi

# ---------------------------------------------------------------------------
# Mock aws to avoid real DDB calls
# ---------------------------------------------------------------------------
MOCK_AWS="$(mktemp -d)/aws"
cat > "$MOCK_AWS" <<'MOCK'
#!/usr/bin/env bash
# Pretend to be aws dynamodb scan -- return a minimal valid response
if [[ "$*" == *"dynamodb scan"* ]]; then
  echo '{"Items":[],"Count":0,"ScannedCount":0}'
  exit 0
fi
exit 1
MOCK
chmod +x "$MOCK_AWS"

# Mock oathtool so the TOTP generation step does not require the real binary.
# The mock returns a fixed 6-digit code that the unreachable server will
# reject (which is expected - the test only validates file production, not
# live API responses).
MOCK_OATHTOOL="$(dirname "$MOCK_AWS")/oathtool"
cat > "$MOCK_OATHTOOL" <<'MOCK'
#!/usr/bin/env bash
echo "123456"
MOCK
chmod +x "$MOCK_OATHTOOL"

# ---------------------------------------------------------------------------
# Prepare output directory
# ---------------------------------------------------------------------------
TMP_OUT="$(mktemp -d)"

# ---------------------------------------------------------------------------
# Run the snapshot script pointing at a non-existent local server.
# curl connections to 127.0.0.1:9999 will be refused (no server running).
# The script must NOT exit non-zero (set -e would kill it on curl errors,
# but we handle curl exit codes internally and continue). If it crashes it
# exits with a non-zero code that we detect below.
# ---------------------------------------------------------------------------
echo "Running snapshot-demo.sh with unreachable API and mocked AWS..."

# Run in a subshell so we can capture exit code without affecting our own
PATH="$(dirname "$MOCK_AWS"):$PATH" \
  API_URL="http://127.0.0.1:9999" \
  OUT_DIR="$TMP_OUT" \
  bash "$MAIN" 2>&1 | tee /tmp/snapshot-test-output.txt
SCRIPT_EXIT=${PIPESTATUS[0]}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

# 1. Script should exit 0 (it logged errors but did not crash)
if [[ $SCRIPT_EXIT -ne 0 ]]; then
  fail "script exited with code $SCRIPT_EXIT -- it crashed instead of handling errors gracefully"
fi
pass "script exited 0 (graceful)"

# 2. An output file should have been created
OUTPUT_FILE=$(ls "$TMP_OUT"/demo-evidence-*.json 2>/dev/null | head -1)
if [[ -z "$OUTPUT_FILE" ]]; then
  fail "no output file found in $TMP_OUT"
fi
pass "output file created: $(basename "$OUTPUT_FILE")"

# 3. The symlink demo-evidence-latest.json should exist
if [[ ! -L "${TMP_OUT}/demo-evidence-latest.json" ]]; then
  fail "demo-evidence-latest.json symlink not found in $TMP_OUT"
fi
pass "latest symlink created"

# 4. Output must be valid JSON
if ! jq . "$OUTPUT_FILE" &>/dev/null; then
  fail "output file is not valid JSON"
fi
pass "output file is valid JSON"

# 5. Top-level keys must be present
for key in capturedAt apiUrl commit ddb endpoints summary; do
  if ! jq -e --arg k "$key" 'has($k)' "$OUTPUT_FILE" &>/dev/null; then
    fail "output JSON missing top-level key: $key"
  fi
done
pass "all required top-level keys present"

# 6. Summary should report errors > 0 (because API was unreachable)
error_count=$(jq '.summary.errors' "$OUTPUT_FILE")
if [[ "$error_count" -le 0 ]]; then
  fail "expected summary.errors > 0 for unreachable API, got $error_count"
fi
pass "summary.errors=$error_count (all endpoint failures recorded)"

# 7. Summary should report the correct endpoint count (at least 1 canonical endpoint)
ep_count=$(jq '.summary.endpoints' "$OUTPUT_FILE")
if [[ "$ep_count" -lt 1 ]]; then
  fail "summary.endpoints is $ep_count, expected >= 1"
fi
pass "summary.endpoints=$ep_count"

# 8. The stdout output (last line) should contain the output path
if ! grep -q "demo-evidence-" /tmp/snapshot-test-output.txt; then
  fail "final output path not printed to stdout"
fi
pass "output path printed to stdout"

# 9. snapshots/ directory must exist under OUT_DIR
SNAP_DIR="${TMP_OUT}/snapshots"
if [[ ! -d "$SNAP_DIR" ]]; then
  fail "snapshots/ directory not found under $TMP_OUT"
fi
pass "snapshots/ directory created"

# 10. All expected per-endpoint snapshot files must be present
EXPECTED_SNAPS=(
  "auth-login-success.json"
  "auth-session.json"
  "auth-mfa-verify-totp.json"
  "admin-sessions-list.json"
  "admin-mfa-status.json"
  "auth-logout-204.json"
)

for snap in "${EXPECTED_SNAPS[@]}"; do
  snap_path="${SNAP_DIR}/${snap}"
  if [[ ! -f "$snap_path" ]]; then
    fail "missing snapshot file: snapshots/${snap}"
  fi
  if ! jq . "$snap_path" &>/dev/null; then
    fail "snapshot file is not valid JSON: snapshots/${snap}"
  fi
  pass "snapshot present and valid JSON: ${snap}"
done

# 11. Each snapshot must carry a capturedAt timestamp field
for snap in "${EXPECTED_SNAPS[@]}"; do
  snap_path="${SNAP_DIR}/${snap}"
  if ! jq -e 'has("capturedAt")' "$snap_path" &>/dev/null; then
    fail "snapshot missing capturedAt field: snapshots/${snap}"
  fi
done
pass "all snapshots carry capturedAt field"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
rm -rf "$TMP_OUT" "$(dirname "$MOCK_AWS")" /tmp/snapshot-test-output.txt

echo ""
echo "All assertions passed."
exit 0
