#!/usr/bin/env bash
# synth-cf.sh - Regenerate the CloudFormation reference YAMLs in infra/cloudformation/
# from the CDK source in infra/cdk/.
#
# The published YAMLs are intentionally stripped of CDK bootstrap artifacts so
# they read as plain CloudFormation for judges and teammates who do not use CDK:
#   - CDKMetadata resource
#   - BootstrapVersion parameter
#   - Rules section (bootstrap version assertion)
#
# Usage:
#   ./scripts/synth-cf.sh
#
# Exit codes:
#   0  success
#   1  CDK synth failed
#   2  missing prerequisite (python3, PyYAML, npx)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CDK_DIR="$REPO_ROOT/infra/cdk"
OUT_DIR="$REPO_ROOT/infra/cloudformation"

STACKS=(
  signal-force-budgets
  signal-force-dynamodb
  signal-force-frontend
  signal-force-runtime
)

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing prerequisite: $1" >&2
    exit 2
  fi
}

require python3
require npx

if ! python3 -c "import yaml" >/dev/null 2>&1; then
  echo "missing prerequisite: PyYAML (pip install pyyaml)" >&2
  exit 2
fi

cd "$CDK_DIR"

# Placeholder account/region let synth run without AWS credentials. The values
# do not appear in the emitted templates because the stacks use Fn::Sub and
# pseudo-parameters rather than baked-in account IDs.
export CDK_DEFAULT_ACCOUNT="${CDK_DEFAULT_ACCOUNT:-000000000000}"
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-us-east-1}"
export CDK_NAG="${CDK_NAG:-off}"

echo "synthesizing CDK app..."
if ! npx cdk synth --quiet >/dev/null 2>&1; then
  echo "cdk synth failed; rerun without --quiet for details" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

for stack in "${STACKS[@]}"; do
  src="$CDK_DIR/cdk.out/${stack}.template.json"
  dst="$OUT_DIR/${stack}.yaml"
  if [[ ! -f "$src" ]]; then
    echo "missing synth output: $src" >&2
    exit 1
  fi
  python3 - "$src" "$dst" <<'PY'
import json, sys, yaml

src, dst = sys.argv[1], sys.argv[2]
template = json.loads(open(src).read())

# Drop CDK bootstrap artifacts so the YAML reads as plain CloudFormation.
template.get("Resources", {}).pop("CDKMetadata", None)
template.pop("Parameters", None)
template.pop("Rules", None)

with open(dst, "w") as f:
    yaml.safe_dump(template, f, sort_keys=False, default_flow_style=False, width=100)
PY
  echo "  wrote $(basename "$dst")"
done

echo "done. review with: git diff -- $OUT_DIR"
