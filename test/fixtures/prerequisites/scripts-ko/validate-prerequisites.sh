#!/usr/bin/env bash
# Test fixture. Validation fails.
set -uo pipefail
echo "fixture: validating" >&2
echo "::VALIDATED::false"
exit 1
