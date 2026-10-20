#!/usr/bin/env bash
# WEBWB step 07: сборка и запуск frontend + backend под общим HTTP-адресом.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${WEBWB_BUILD_DIR:-/tmp/webwb-build}"
cmake -S "$ROOT" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Debug
cmake --build "$BUILD_DIR" --clean-first -j2
python3 "$ROOT/tests/dev_server.py" "$BUILD_DIR/webwb_backend"
