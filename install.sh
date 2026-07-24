#!/usr/bin/env bash
# ai-real-friend — install shim.
# Delegates to bin/install.js.

set -e

if ! command -v node >/dev/null 2>&1; then
  echo "ai-real-friend: node is required (Node.js 18+)"
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/bin/install.js" "$@"
