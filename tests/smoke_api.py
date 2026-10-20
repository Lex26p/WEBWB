#!/usr/bin/env python3
"""Проверка HTTP API WEBWB в WSL: запуск, CRUD, сохранение между перезапусками.

Использует только стандартную библиотеку Python 3. Не трогает пользовательские
проекты: сервер запускается на свободном localhost-порту и во временном каталоге.
"""

import json
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
DEFAULT_BINARY = Path('/tmp/webwb-build/webwb_backend')
FIXTURE = REPO / 'tests' / 'fixtures' / 'project-v3.json'


class CheckFailure(Exception):
    pass


def require(condition, description, diagnostics=None):
    if not condition:
        message = description
        if diagnostics:
            message += "\n" + diagnostics
        raise CheckFailure(message)
    print('[OK] ' + description)


def find_available_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def request(port, method, endpoint, body=None):
    url = f'http://127.0.0.1:{port}{endpoint}'
    payload = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    headers = {'Content-Type': 'application/json'} if payload is not None else {}
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    try:
        result = json.loads(raw) if raw else None
    except ValueError:
        raise CheckFailure(f'{method} {endpoint}: ответ не является JSON ({status}): {raw!r}')
    return status, result


def start_server(binary, port, data_directory):
    log = tempfile.TemporaryFile(mode='w+t', encoding='utf-8')
    process = subprocess.Popen(
        [str(binary), '--port', str(port), '--data-dir', str(data_directory)],
        stdout=log, stderr=subprocess.STDOUT,
    )
    try:
        for _ in range(40):
            if process.poll() is not None:
                raise CheckFailure(f'Backend завершился с кодом {process.returncode}')
            try:
                status, _ = request(port, 'GET', '/api/health')
                if status == 200:
                    return process, log
            except (OSError, TimeoutError):
                pass
            time.sleep(0.1)
        raise CheckFailure('Backend не запустился за 4 секунды')
    except Exception:
        stop_server(process)
        log.seek(0)
        sys.stderr.write('Лог backend:\n' + log.read() + '\n')
        log.close()
        raise


def stop_server(process):
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def test_api(binary):
    project = json.loads(FIXTURE.read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='webwb-smoke-') as data_dir:
        port = find_available_port()
        process, log = start_server(binary, port, data_dir)
        try:
            status, response = request(port, 'GET', '/api/health')
            require(status == 200 and response.get('status') == 'ok', 'Сервер отвечает на /api/health')

            status, response = request(port, 'POST', '/api/projects/validate', project)
            require(status == 200 and response.get('valid') is True, 'Валидация проекта')

            status, response = request(port, 'POST', '/api/projects', project)
            project_id = response.get('id') if isinstance(response, dict) else None
            require(status == 201 and isinstance(project_id, str) and len(project_id) > 0,
                    'Создание проекта',
                    f'POST /api/projects: HTTP {status}, тело ответа: '
                    f'{json.dumps(response, ensure_ascii=False)}')
            endpoint = '/api/projects/' + project_id

            status, response = request(port, 'GET', '/api/projects')
            require(status == 200 and any(item.get('id') == project_id for item in response['projects']),
                    'Проект появился в списке')

            status, response = request(port, 'GET', endpoint)
            require(status == 200 and response.get('title') == project['title'], 'Чтение проекта')

            modified = dict(project)
            modified['title'] = 'WEBWB smoke test — изменённый проект'
            status, response = request(port, 'PUT', endpoint, modified)
            require(status == 200 and response.get('updated') is True, 'Изменение проекта')

            status, response = request(port, 'GET', endpoint)
            require(status == 200 and response.get('title') == modified['title'], 'Изменения сохранились')

            status, response = request(port, 'PUT', endpoint, {'version': 999})
            require(status == 400 and response.get('error') == 'invalid_project',
                    'Некорректный проект отклоняется')

            status, response = request(port, 'GET', endpoint)
            require(status == 200 and response.get('title') == modified['title'],
                    'Неверный запрос не повредил проект')

            # Шаблоны хранятся на backend отдельно от проектов.
            sample_template = {'name': 'Панель освещения', 'node': project['root']['children'][0]}
            status, response = request(port, 'GET', '/api/templates')
            require(status == 200 and response.get('templates') == [], 'Пустой список шаблонов')
            status, response = request(port, 'POST', '/api/templates', sample_template)
            template_id = response.get('id') if isinstance(response, dict) else None
            require(status == 201 and isinstance(template_id, str) and len(template_id) == 32,
                    'Создание серверного шаблона', f'HTTP {status}, {response!r}')
            status, response = request(port, 'GET', '/api/templates')
            require(status == 200 and len(response['templates']) == 1 and
                    response['templates'][0]['id'] == template_id and
                    response['templates'][0]['node'] == sample_template['node'],
                    'Чтение шаблона со вложенными элементами')
            status, response = request(port, 'POST', '/api/templates', {'name': 'Bad', 'node': {'type': 'unknown'}})
            require(status == 400 and response.get('error') == 'invalid_template', 'Некорректный шаблон отклоняется')
            status, response = request(port, 'GET', '/api/templates')
            require(status == 200 and len(response['templates']) == 1, 'Неверный запрос не повреждает шаблон')

            stop_server(process)
            log.close()
            process, log = start_server(binary, port, data_dir)
            status, response = request(port, 'GET', endpoint)
            require(status == 200 and response.get('title') == modified['title'],
                    'Проект сохранился после перезапуска backend')
            status, response = request(port, 'GET', '/api/templates')
            require(status == 200 and len(response['templates']) == 1 and
                    response['templates'][0]['id'] == template_id,
                    'Шаблон сохранился после перезапуска backend')
            status, response = request(port, 'DELETE', '/api/templates/'+template_id)
            require(status == 204, 'Удаление серверного шаблона')
            status, response = request(port, 'GET', '/api/templates')
            require(status == 200 and response['templates'] == [], 'Удалённый шаблон отсутствует')


            status, _ = request(port, 'DELETE', endpoint)
            require(status == 204, 'Удаление проекта')

            status, _ = request(port, 'GET', endpoint)
            require(status == 404, 'Удалённый проект больше недоступен')

        except Exception:
            # Ранее сюда попадали ответы 500, но test выводил лишь название
            # проверки. Теперь печатаем журнал тестового backend для диагностики.
            stop_server(process)
            log.flush()
            log.seek(0)
            server_output = log.read().strip()
            print('\n== Журнал тестового backend ==', file=sys.stderr)
            print(server_output or '(журнал пуст)', file=sys.stderr)
            print('== Конец журнала ==', file=sys.stderr)
            raise
        finally:
            stop_server(process)
            log.close()


if __name__ == '__main__':
    executable = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else DEFAULT_BINARY
    if not executable.is_file():
        sys.exit(f'[ERROR] Backend не найден: {executable}\nСначала соберите проект через CMake.')
    if not FIXTURE.is_file():
        sys.exit(f'[ERROR] Отсутствует тестовый проект: {FIXTURE}')
    try:
        test_api(executable)
        print('\nВсе проверки API прошли успешно.')
    except (CheckFailure, OSError, ValueError, KeyError, TypeError) as error:
        sys.exit(f'\n[ERROR] {error}')
