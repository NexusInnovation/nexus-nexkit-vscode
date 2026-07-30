#!/usr/bin/env bash
# Test fixture. Mimics a workspace whose prerequisites are not satisfied.
set -uo pipefail
echo "fixture: checking"
echo "::VALIDATED::false"
exit 1
