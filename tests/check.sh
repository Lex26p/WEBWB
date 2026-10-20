#!/usr/bin/env bash
# WEBWB: clean build, CTest and HTTP API smoke test in WSL.
# A clean rebuild is intentional: archive extraction on Windows can restore
# older source timestamps, causing CMake to reuse a stale backend executable.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${WEBWB_BUILD_DIR:-/tmp/webwb-build}"
BINARY="$BUILD_DIR/webwb_backend"

echo '== Сборка WEBWB (полная пересборка) =='
cmake -S "$ROOT" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Debug
cmake --build "$BUILD_DIR" --clean-first -j2

echo '== Проверка версии backend =='
if ! "$BINARY" --help | grep -Fq 'GET/POST /api/projects'; then
  echo '[ERROR] Backend не содержит API проектов (шаг 06).' >&2
  echo 'Проверь, что архив WEBWB-step-06-with-tests.zip распакован поверх репозитория.' >&2
  echo 'Текущая справка backend:' >&2
  "$BINARY" --help >&2
  exit 1
fi

echo '== Тесты C++ =='
ctest --test-dir "$BUILD_DIR" --output-on-failure

echo '== Проверка HTTP API =='
python3 "$ROOT/tests/smoke_api.py" "$BINARY"

echo '== WEBWB: все проверки пройдены =='
