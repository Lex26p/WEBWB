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
  echo 'Проверь, что архив актуального шага распакован поверх репозитория.' >&2
  echo 'Текущая справка backend:' >&2
  "$BINARY" --help >&2
  exit 1
fi

if ! "$BINARY" --help | grep -Fq 'GET/POST /api/templates'; then
  echo '[ERROR] Backend не содержит API шаблонов (шаг 08).' >&2
  exit 1
fi

echo '== Проверка исходников JavaScript =='
for source in "$ROOT"/frontend/js/*.js "$ROOT"/frontend/app.js "$ROOT"/frontend/viewer.js; do
  if command -v node >/dev/null 2>&1; then node --check "$source"; fi
done
if ! "$BINARY" --help | grep -Fq 'GET/POST /api/uploads'; then
  echo '[ERROR] Backend не содержит API изображений (шаг 09).' >&2
  exit 1
fi

echo '== Проверка MQTT-клиента (только чтение) =='
if command -v node >/dev/null 2>&1; then
  node "$ROOT/tests/mqtt_reader_test.js"
else
  echo '[INFO] Node.js отсутствует: проверка MQTT-клиента пропущена (C++/HTTP тесты продолжаются).'
fi

echo '== Тесты C++ =='
ctest --test-dir "$BUILD_DIR" --output-on-failure

echo '== Проверка HTTP API =='
python3 "$ROOT/tests/smoke_api.py" "$BINARY"

echo '== Проверка совместного HTTP-доступа к редактору и API =='
python3 "$ROOT/tests/smoke_frontend.py" "$BINARY"

echo '== WEBWB: все проверки пройдены =='
