#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if command -v node >/dev/null 2>&1; then
  NODE=node
elif command -v node.exe >/dev/null 2>&1; then
  NODE=node.exe
elif [[ -x /c/node.exe ]]; then
  NODE=/c/node.exe
else
  printf '%s\n' 'Node.js was not found. Add it to PATH before rollback.' >&2
  exit 1
fi
"$NODE" "$ROOT/.upgrade/rollback.cjs" "${1:-$ROOT}"
