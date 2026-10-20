/* WEBWB: отдельный просмотр сохранённого проекта без редактора и MQTT. */
(() => {
  'use strict';
  const canvas = document.getElementById('viewerCanvas');
  const status = document.getElementById('viewerStatus');
  const hint = document.getElementById('viewerDemo');
  const projectId = new URLSearchParams(window.location.search).get('id');

  function showError(message) {
    canvas.hidden = true;
    hint.hidden = true;
    status.hidden = false;
    status.classList.add('error');
    status.textContent = message;
  }

  async function loadProject() {
    if (!projectId || !/^[0-9a-f]{32}$/.test(projectId)) {
      showError('Некорректная ссылка на панель: отсутствует ID сохранённого проекта.');
      return;
    }
    try {
      const raw = await window.WBPanelAPI.load(projectId);
      const project = window.WBPanelModel.normalizeProject(raw);
      document.title = project.title + ' — WEBWB';
      canvas.replaceChildren(window.WBPanelRenderer.createElement(project.root, {
        interactive: true,
        onDemoAction: () => { hint.textContent = 'Демонстрация: MQTT-команда не отправлена'; }
      }));
      canvas.hidden = false;
      hint.hidden = false;
      status.hidden = true;
    } catch (error) {
      showError('Не удалось открыть сохранённую панель: ' + error.message);
    }
  }

  loadProject();
})();
