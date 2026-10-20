#!/usr/bin/env python3
"""Проверка локального HTTP-доступа к frontend и project API без браузерных зависимостей."""
import http.client
import json
import base64
import os
import signal
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def request(port, method, path, body=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    headers = {'Content-Type': 'application/json'} if body is not None else {}
    connection.request(method, path, body=body, headers=headers)
    response = connection.getresponse()
    data = response.read()
    connection.close()
    return response.status, data


def check(condition, name):
    if not condition:
        raise RuntimeError(name)
    print('[OK]', name)


def main():
    binary = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='webwb-frontend-') as data_dir:
        port = free_port()
        proc = subprocess.Popen(
            [sys.executable, str(ROOT / 'tests/dev_server.py'), str(binary),
             '--port', str(port), '--data-dir', data_dir],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            for _ in range(80):
                if proc.poll() is not None:
                    raise RuntimeError('Сервер завершился до запуска')
                try:
                    code, _ = request(port, 'GET', '/api/health')
                    if code == 200:
                        break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Сервер не ответил вовремя')
            code, html = request(port, 'GET', '/')
            check(code == 200 and b'id="saveServerBtn"' in html, 'Редактор доступен по HTTP')
            code, js = request(port, 'GET', '/js/api.js')
            check(code == 200 and b'WBPanelAPI' in js, 'JavaScript API доступен')
            code, css = request(port, 'GET', '/styles.css')
            check(code == 200 and b'.topbar' in css, 'Стили доступны')
            code, body = request(port, 'GET', '/api/projects')
            check(code == 200 and json.loads(body)['projects'] == [], 'Список проектов через общий адрес')
            sample = (ROOT/'tests/fixtures/project-v3.json').read_bytes()
            code, body = request(port, 'POST', '/api/projects', sample)
            ident = json.loads(body).get('id') if body else None
            check(code == 201 and ident and len(ident) == 32, 'Создание проекта через общий адрес')
            code, body = request(port, 'GET', '/api/projects/'+ident)
            check(code == 200 and json.loads(body)['version'] == 3, 'Чтение проекта через общий адрес')
            code, body = request(port, 'PUT', '/api/projects/'+ident, sample)
            check(code == 200, 'Сохранение изменений через общий адрес')
            code, body = request(port, 'GET', '/api/projects')
            check(code == 200 and len(json.loads(body)['projects']) == 1, 'Обновление списка проектов')
            template = {'name': 'Тестовый шаблон', 'node': json.loads(sample)['root']['children'][0]}
            code, body = request(port, 'GET', '/api/templates')
            check(code == 200 and json.loads(body)['templates'] == [], 'Шаблоны через общий HTTP-адрес')
            code, body = request(port, 'POST', '/api/templates', json.dumps(template, ensure_ascii=False).encode())
            template_id = json.loads(body).get('id') if body else None
            check(code == 201 and template_id and len(template_id) == 32, 'Создание шаблона через HTTP-прокси')
            code, body = request(port, 'GET', '/api/templates')
            check(code == 200 and json.loads(body)['templates'][0]['id'] == template_id, 'Чтение серверного шаблона')
            code, body = request(port, 'DELETE', '/api/templates/' + template_id)
            check(code == 204, 'Удаление серверного шаблона через HTTP-прокси')
            image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/uS8AAAAASUVORK5CYII=')
            code, body = request(port, 'POST', '/api/uploads', image)
            image_id = json.loads(body).get('id')
            check(code == 201 and image_id, 'Загрузка PNG через общий HTTP-адрес')
            code, body = request(port, 'GET', '/api/uploads/'+image_id)
            check(code == 200 and body == image, 'Картинка доступна по HTTP')
            code, body = request(port, 'GET', '/api/settings')
            check(code == 200 and json.loads(body)['title'] == 'WEBWB', 'Настройки через HTTP-прокси')
            code, body = request(port, 'GET', '/js/../../backend/src/main.cpp')
            check(code == 404, 'Недоступность исходников через HTTP')
        finally:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
    print('== HTTP-проверка редактора пройдена ==')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('[ERROR]', exc, file=sys.stderr)
        sys.exit(1)
