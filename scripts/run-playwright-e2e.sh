#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export PATH="$PATH:/usr/share/nodejs/corepack/shims"

echo "=== [1/2] Pre-building backend dependencies for E2E ==="
cd "$REPO_ROOT"
./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json
./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json
./node_modules/.bin/tsc -p packages/db/tsconfig.json
./node_modules/.bin/tsc -p apps/build-server/tsconfig.json

echo "=== [2/2] Running Playwright E2E Suite ==="
cd "$REPO_ROOT/apps/build-monitor"
npx playwright test --config=playwright.config.ts "$@"
