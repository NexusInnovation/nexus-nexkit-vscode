#!/usr/bin/env bash
# Test fixture. Validation succeeds.
set -euo pipefail
if [ "${1:-}" = "-Interactive:\$false" ]; then
  echo "fixture: ignoring windows-style switch"
fi
echo "fixture: validating"
echo "::VALIDATED::true"
exit 0
