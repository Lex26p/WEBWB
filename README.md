# WEBWB

WEBWB — лёгкий визуальный редактор панелей управления для контроллеров Wiren Board.

Пользователь собирает интерфейс из контейнеров, текста, кнопок, переключателей и ползунков, настраивает внешний вид и, в будущих версиях, привязывает элементы к MQTT-топикам. Правила и автоматизация остаются на самом контроллере.

## Текущее состояние

**Шаги 01–04 подтверждены** (последний коммит: `283b3156c557efd5b05dfd224768dffb7570e86d`). **Шаг 05 подготовлен**: backend проверяет структуру JSON-проекта версии 3 через `POST /api/projects/validate`. Данные ещё не сохраняются на сервере; MQTT пока отсутствует.

В прототипе редактора доступны контейнеры, текст, кнопки, переключатели и ползунки, Drag & Drop, дерево, CSS-свойства, шаблоны, экспорт/импорт JSON и демонстрационный просмотр. Редактор всё ещё использует `localStorage`.

**Добавление элементов:** только перетаскиванием, без добавления по клику.

## Быстрый запуск

Откройте `frontend/index.html` в современном браузере (Chrome, Edge, Firefox). Для редактора HTTP-сервер, npm, сборка и интернет не требуются.

Для просмотра используйте кнопку **Просмотр**. Устройства не управляются: MQTT пока нет.

Подробная инструкция по интерфейсу прототипа: [docs/PROTOTYPE_V03.md](docs/PROTOTYPE_V03.md).

## C++ backend (шаг 05)

Нужны CMake >= 3.16, компилятор C++17, заголовки Boost.Beast/Asio (`libboost-dev`), `json-c` (`libjson-c-dev`) и потоки Linux. В WSL:

```bash
cd /mnt/c/Projects/WEBWB
cmake -S . -B /tmp/webwb-build -DCMAKE_BUILD_TYPE=Debug
cmake --build /tmp/webwb-build -j2
ctest --test-dir /tmp/webwb-build --output-on-failure
/tmp/webwb-build/webwb_backend --port 8088 --data-dir /tmp/webwb-data
```

Из второго терминала WSL проверить `curl -i http://127.0.0.1:8088/api/health` (ожидается `200 OK` и JSON). Остановить backend — `Ctrl+C`. Подробности: [backend/README.md](backend/README.md).

Backend слушает только `127.0.0.1`, не имеет собственной авторизации, не управляет MQTT и пока не сохраняет данные. Формат проекта описан в [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md), а тестовый файл находится в `tests/fixtures/project-v3.json`. Установка на WB будет отдельно после проверки toolchain.

## Структура

```text
WEBWB/
├── .gitattributes             # уже создан в репозитории
├── .gitignore                 # уже создан в репозитории
├── README.md
├── AGENTS.md                  # соглашения по работе над кодом
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js                # история, действия и обработчики событий
│   └── js/
│       ├── model.js         # данные проекта и JSON
│       ├── view.js          # дерево и отображение элементов
│       └── properties.js    # панель свойств и изменение CSS
├── CMakeLists.txt             # C++17 backend, CTest
├── backend/
│   ├── README.md             # требования и запуск в WSL
│   ├── include/webwb/project_validation.hpp
│   ├── src/main.cpp          # HTTP-сервер
│   ├── src/project_validation.cpp # JSON-проверка
│   └── tests/project_validation_test.cpp
├── tests/fixtures/project-v3.json
└── docs/
    ├── ROADMAP.md
    ├── ARCHITECTURE.md
    ├── STATE.md
    ├── PROJECT_FORMAT.md
    ├── PROTOTYPE_V03.md
    └── assets/editor-v0.3.png
```

JavaScript разделён по ответственности без сборщика и без ES-модулей — `index.html` по-прежнему можно открыть напрямую с диска (`file://`). Файлы подключаются по порядку с `defer`: `model.js`, `view.js`, `properties.js`, `app.js`. Для связи модулей используется небольшой объект `window.WBPanelModel` и фабрики отрисовки/свойств с передачей контекста. Это внутреннее API; API backend появится позже. Шаг 05 также не изменяет frontend; после его подтверждения перейдём к файловому хранению проектов (шаг 06).

## Основные документы

- [Дорожная карта](docs/ROADMAP.md) — согласованные этапы разработки.
- [Архитектура](docs/ARCHITECTURE.md) — принятые решения, границы модулей и хранение.
- [Формат JSON](docs/PROJECT_FORMAT.md) — поля, ограничения и тестовый API.
- [Текущее состояние](docs/STATE.md) — последняя подтверждённая версия, следующий шаг, ограничения.
- [Правила разработки](AGENTS.md) — процесс работы с архивами, WSL и Git.

## Репозиторий

https://github.com/Lex26p/WEBWB

GitHub — единственный источник истины для подтверждённых изменений. Исходники готовит ассистент в ZIP-архиве; распаковку, тестирование и Git commit/push выполняет владелец проекта. Ассистент сам не изменяет GitHub.
