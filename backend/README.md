# WEBWB backend — HTTP API и проверка проектов (шаг 05)

Минимальный C++17 HTTP-сервер на Boost.Beast (только заголовочные файлы) и CMake. C++ backend умеет проверять JSON-проекты v3, но пока не сохраняет файлы, шаблоны и не работает с MQTT.

## Зависимости для сборки в WSL

- CMake >= 3.16;
- компилятор C++17 (`g++` или совместимый);
- заголовки Boost.Beast/Asio (`libboost-dev`);
- библиотека `json-c` и заголовки (`libjson-c-dev`) для проверки проекта;
- pthreads (на Linux обычно входит в систему).

Установка зависимости при её отсутствии в Debian/Ubuntu WSL:

```bash
sudo apt update
sudo apt install -y cmake g++ libboost-dev libjson-c-dev
```

Зависимости не скачиваются сборщиком CMake. Boost используется только через заголовки, без динамических библиотек Boost. `json-c` линкуется как системная библиотека. Перед кросс-компиляцией под WB нужно проверить архитектуру процессора и доступность этих заголовков в toolchain/среде сборки.

## Сборка в WSL

```bash
cd /mnt/c/Projects/WEBWB
cmake -S . -B /tmp/webwb-build -DCMAKE_BUILD_TYPE=Debug
cmake --build /tmp/webwb-build -j2
ctest --test-dir /tmp/webwb-build --output-on-failure
```

Сборка вынесена в `/tmp`, поэтому с `git add .` в репозиторий не попадут бинарники и файлы CMake.

## Запуск

```bash
/tmp/webwb-build/webwb_backend --port 8088 --data-dir /tmp/webwb-data
```

В **другом терминале WSL**:

```bash
curl -i http://127.0.0.1:8088/api/health
curl -i http://127.0.0.1:8088/api/not-found
curl -i -H "Content-Type: application/json" --data-binary @tests/fixtures/project-v3.json http://127.0.0.1:8088/api/projects/validate
```

Ожидается HTTP `200` с JSON `{"status":"ok","service":"webwb"}` для первой команды и HTTP `404` для второй. `POST /api/health` возвращает `405`. Проверка проекта возвращает `200` и `{"valid":true,"version":3}`; неверный формат проекта возвращает `400`.

Формат и его ограничения описаны в [docs/PROJECT_FORMAT.md](../docs/PROJECT_FORMAT.md). `ctest` дополнительно проверяет ограничения вложенности, число узлов, типы полей и некорректные документы.

Слушает **только** `127.0.0.1`; отдельная авторизация приложения не предусмотрена. Параметр `--data-dir` принимается и выводится в журнал, но каталог пока **не создаётся**, никакие данные туда не записываются. Путь для контроллера по умолчанию: `/mnt/data/webwb`.

Ограничения текущего этапа: проверка JSON не сохраняет данные; синхронная обработка одного соединения за раз (с ограничением чтения 5 секунд), без TLS, nginx, установки в systemd и реального файлового API. Позднее проверим работу на WB и при необходимости расширим обслуживание соединений.
