#!/usr/bin/env python3
"""WEBWB WSL development gateway: frontend files and /api on a single origin.

Uses only Python standard library. Not intended for deployment on Wiren Board;
production nginx will replace this gateway later.
"""

import argparse
import http.client
import http.server
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / 'frontend'
FILES = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/viewer.html': ('viewer.html', 'text/html; charset=utf-8'),
    '/viewer.css': ('viewer.css', 'text/css; charset=utf-8'),
    '/viewer.js': ('viewer.js', 'application/javascript; charset=utf-8'),
    '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
    '/app.js': ('app.js', 'application/javascript; charset=utf-8'),
    '/js/model.js': ('js/model.js', 'application/javascript; charset=utf-8'),
    '/js/view.js': ('js/view.js', 'application/javascript; charset=utf-8'),
    '/js/renderer.js': ('js/renderer.js', 'application/javascript; charset=utf-8'),
    '/js/properties.js': ('js/properties.js', 'application/javascript; charset=utf-8'),
    '/js/api.js': ('js/api.js', 'application/javascript; charset=utf-8'),
    '/js/mqtt_reader.js': ('js/mqtt_reader.js', 'application/javascript; charset=utf-8'),
}


def available_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait_backend(port, process):
    for _ in range(60):
        if process.poll() is not None:
            raise RuntimeError(f'Backend завершился с кодом {process.returncode}')
        try:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=0.5)
            conn.request('GET', '/api/health')
            response = conn.getresponse()
            response.read()
            conn.close()
            if response.status == 200:
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError('Backend не запустился')


class EditorGateway(http.server.BaseHTTPRequestHandler):
    backend_port = None
    protocol_version = 'HTTP/1.1'

    def log_message(self, format, *args):
        sys.stderr.write('[WEBWB dev] ' + format % args + '\n')

    def send_bytes(self, status, data, mime='application/json; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def handle_api(self):
        size_str = self.headers.get('Content-Length', '0')
        try:
            size = int(size_str)
            if size < 0 or size > 1024 * 1024:
                self.send_bytes(413, b'{"error":"request_too_large"}')
                return
        except ValueError:
            self.send_bytes(400, b'{"error":"invalid_length"}')
            return
        body = self.rfile.read(size) if size else None
        try:
            conn = http.client.HTTPConnection('127.0.0.1', self.backend_port, timeout=8)
            headers = {'Content-Type': self.headers.get('Content-Type', 'application/json')}
            conn.request(self.command, self.path, body=body, headers=headers)
            response = conn.getresponse()
            result = response.read()
            self.send_bytes(response.status, result,
                response.getheader('Content-Type', 'application/json; charset=utf-8'))
            conn.close()
        except (OSError, http.client.HTTPException):
            self.send_bytes(502, b'{"error":"backend_unavailable"}')

    def serve_file(self):
        path = urlsplit(self.path).path
        if path not in FILES:
            self.send_bytes(404, b'{"error":"not_found"}')
            return
        filename, mime = FILES[path]
        content = (FRONTEND / filename).read_bytes()
        self.send_bytes(200, content, mime)

    def do_GET(self):
        if urlsplit(self.path).path.startswith('/api/'):
            self.handle_api()
        else:
            self.serve_file()

    def do_POST(self):
        if urlsplit(self.path).path.startswith('/api/'):
            self.handle_api()
        else:
            self.send_bytes(405, b'{"error":"method_not_allowed"}')

    def do_PUT(self):
        self.do_POST()

    def do_DELETE(self):
        self.do_POST()


def main():
    parser = argparse.ArgumentParser(description='Локальный WEBWB редактор + C++ API')
    parser.add_argument('backend_binary', type=Path)
    parser.add_argument('--port', type=int, default=8090)
    parser.add_argument('--data-dir', default='/tmp/webwb-dev-data')
    args = parser.parse_args()
    if args.port < 1 or args.port > 65535:
        parser.error('--port должен быть в пределах 1–65535')
    backend_port = available_port()
    command = [str(args.backend_binary.resolve()), '--port', str(backend_port), '--data-dir', args.data_dir]
    process = subprocess.Popen(command)
    try:
        wait_backend(backend_port, process)
        EditorGateway.backend_port = backend_port
        server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), EditorGateway)
        server.daemon_threads = True
        print(f'WEBWB редактор: http://localhost:{args.port}/', flush=True)
        print(f'Проекты: {args.data_dir} (сохраняются между запусками)', flush=True)
        print('Остановка: Ctrl+C', flush=True)
        try:
            server.serve_forever(poll_interval=0.2)
        finally:
            server.server_close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=4)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, RuntimeError) as error:
        print(f'[WEBWB] {error}', file=sys.stderr)
        sys.exit(1)
