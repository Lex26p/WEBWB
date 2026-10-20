/* WEBWB: проекты на backend. Все URL относительны текущему HTTP-сайту. */
(() => {
  'use strict';
  const ROOT = '/api/projects';
  const TEMPLATES = '/api/templates';

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        cache: 'no-store',
        ...options,
        headers: { ...(options.body === undefined ? {} : {'Content-Type': 'application/json'}), ...options.headers }
      });
    } catch (_) {
      throw new Error('Нет связи с сервером. Запустите редактор через tests/run_editor.sh.');
    }
    let payload = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); }
      catch { throw new Error('Сервер вернул некорректный JSON'); }
    }
    if (!response.ok) {
      const detail = payload?.detail || payload?.error || response.statusText;
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    return payload;
  }

  const idPath = id => {
    if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Некорректный ID проекта');
    return ROOT + '/' + id;
  };

  window.WBPanelAPI = Object.freeze({
    list: async () => (await request(ROOT)).projects,
    load: id => request(idPath(id)),
    create: project => request(ROOT, {method:'POST', body:JSON.stringify(project)}),
    update: (id, project) => request(idPath(id), {method:'PUT', body:JSON.stringify(project)}),
    uploadImage: async file => {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 1024*1024 || file.size === 0)
        throw new Error('Только PNG, JPEG, WebP размером до 1 МиБ');
      const response = await fetch('/api/uploads', {method:'POST', body:file, headers:{'Content-Type':file.type}});
      const data = await response.json();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || 'не удалось загрузить файл'}`);
      if (!/^\/api\/uploads\/[a-f0-9]{32}$/.test(data.url)) throw new Error('Некорректный ответ сервера');
      return data;
    },
    listImages: async () => (await request('/api/uploads')).uploads,
    getSettings: () => request('/api/settings'),
    updateSettings: settings => request('/api/settings', {method:'PUT', body:JSON.stringify(settings)}),
    listTemplates: async () => (await request(TEMPLATES)).templates,
    createTemplate: template => request(TEMPLATES, {method:'POST', body:JSON.stringify(template)}),
    deleteTemplate: id => {
      if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Некорректный ID шаблона');
      return request(TEMPLATES + '/' + id, {method:'DELETE'});
    }
  });
})();
