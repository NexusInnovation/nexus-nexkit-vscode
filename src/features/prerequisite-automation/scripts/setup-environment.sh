#!/usr/bin/env bash
# setup-environment.sh
# Installs missing prerequisites and records the validation state.
# Called by Nexkit after the user consents to setup.

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "==========================================="
echo "  Nexkit - Environment Setup"
echo "==========================================="
echo ""

# Delegate to validate-prerequisites, which exits non-zero when required tools
# are absent. The extension never passes --interactive, so no Read prompts run.
"$SCRIPT_DIR/validate-prerequisites.sh" "$@"
exit $?
