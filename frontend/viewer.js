/* WEBWB: панель проекта, MQTT-состояния и команды (шаг 12). */
(() => {
  'use strict';
  const canvas = document.getElementById('viewerCanvas');
  const status = document.getElementById('viewerStatus');
  const hint = document.getElementById('viewerDemo');
  const query = new URLSearchParams(window.location.search);
  const projectId = query.get('id');
  let mqttReader = null;

  function showError(message) {
    canvas.hidden = true;
    hint.hidden = true;
    status.hidden = false;
    status.classList.add('error');
    status.textContent = message;
  }

  function subscriptions(root) {
    const byTopic = new Map();
    function walk(node) {
      const topic = node.mqtt?.statusTopic;
      if (window.WBPanelMQTT.validTopic(topic)) {
        if (!byTopic.has(topic)) byTopic.set(topic, []);
        byTopic.get(topic).push(node);
      }
      if (node.type === 'container') node.children.forEach(walk);
    }
    walk(root);
    return byTopic;
  }

  function applyStatus(node, payload) {
    const el = [...canvas.querySelectorAll('[data-node-id]')].find(item => item.dataset.nodeId === node.id);
    if (!el) return;
    if (node.type === 'text') {
      el.textContent = [node.text, payload].filter(Boolean).join(' ');
    } else if (node.type === 'button') {
      el.classList.toggle('is-active', payload === (node.mqtt.activeValue ?? '1'));
    } else if (node.type === 'switch') {
      const input = el.querySelector('input[type="checkbox"]');
      if (input) input.checked = payload === (node.mqtt.activeValue ?? '1');
    } else if (node.type === 'slider') {
      const input = el.querySelector('input[type="range"]');
      const label = el.querySelector('.slider-value');
      const numeric = Number(payload);
      if (!input || !Number.isFinite(numeric) || !payload.trim()) return;
      input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), numeric)));
      if (label) label.textContent = payload;
    }
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
      const topicMap = subscriptions(project.root);
      let actionCount = 0;
      function countActions(node) {
        if (['button', 'switch', 'slider'].includes(node.type) &&
            window.WBPanelMQTT.validTopic(node.mqtt?.actionTopic)) actionCount++;
        if (node.type === 'container') node.children.forEach(countActions);
      }
      countActions(project.root);
      canvas.replaceChildren(window.WBPanelRenderer.createElement(project.root, {
        interactive: true,
        onDemoAction: () => { hint.textContent = 'Демонстрация: MQTT-команда не настроена'; },
        onAction: (node, payload) => {
          const sent = mqttReader?.publish(node.mqtt?.actionTopic, String(payload)) || false;
          if (!sent) hint.textContent = 'MQTT: команда не отправлена · нет соединения';
          return sent;
        }
      }));
      canvas.hidden = false;
      status.hidden = true;
      hint.hidden = false;
      if (!topicMap.size && !actionCount) {
        hint.textContent = 'Демонстрационный просмотр · MQTT-топики не назначены';
        return;
      }
      let url;
      try { url = window.WBPanelMQTT.resolveURL(query.get('mqttUrl'), window.location); }
      catch (error) { hint.textContent = 'MQTT: неверный адрес подключения (' + error.message + ')'; return; }
      mqttReader = window.WBPanelMQTT.createReader({
        url,
        topics: [...topicMap.keys()],
        allowCommands: actionCount > 0,
        onMessage: (topic, value) => topicMap.get(topic)?.forEach(node => applyStatus(node, value)),
        onState: state => {
          hint.textContent = state === 'connected' ? 'MQTT: подключено' :
            state === 'connecting' ? 'MQTT: подключение…' : 'MQTT: нет соединения · повторная попытка';
        }
      });
      mqttReader.start();
    } catch (error) {
      showError('Не удалось открыть сохранённую панель: ' + error.message);
    }
  }

  window.addEventListener('pagehide', () => mqttReader?.stop());
  loadProject();
})();
