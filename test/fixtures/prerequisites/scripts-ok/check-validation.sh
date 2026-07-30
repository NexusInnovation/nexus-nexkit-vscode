#!/usr/bin/env bash
# Test fixture. Mimics the contract of the real check script: emit the marker,
# then exit 0 for "validated".
set -euo pipefail
echo "fixture: checking"
echo "::VALIDATED::true"
exit 0
