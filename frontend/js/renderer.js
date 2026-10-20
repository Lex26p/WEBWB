/* WEBWB: единый рендеринг элементов для редактора и отдельного просмотра. */
(() => {
  'use strict';
  const { STYLE_KEYS } = window.WBPanelModel;
  function applyNodeStyle(el, node, parent, index) {
    const style = node.style || {};
    for (const [key, value] of Object.entries(style)) {
      if (!STYLE_KEYS.has(key) || ['borderWidth','borderColor','position','left','top'].includes(key)) continue;
      el.style[key] = String(value);
    }
    if (style.borderWidth && parseFloat(style.borderWidth) > 0) {
      el.style.border = `${parseFloat(style.borderWidth)}px solid ${style.borderColor || '#d7e1ee'}`;
    }
    if (parent && parent.style.display === 'block') {
      el.style.position = 'absolute';
      el.style.left = style.left || '16px';
      el.style.top = style.top || `${16 + index * 58}px`;
    } else if (node.type === 'container' && style.display === 'block') {
      el.style.position = 'relative';
      el.classList.add('free-container');
    }
  }

  function createElement(node, options = {}, parent = null, index = 0) {
    const interactive = !!options.interactive;
    const selectedId = options.selectedId || null;
    let el;
    if (node.type === 'button') {
      el = document.createElement('button'); el.type = 'button';
      el.className = 'node wb-button'; el.textContent = node.text;
      if (!interactive) el.tabIndex = -1;
      else if (!node.mqtt?.statusTopic) el.addEventListener('click', () => {
        el.classList.toggle('is-active');
        if (options.onDemoAction) options.onDemoAction();
      });
    } else if (node.type === 'switch') {
      el = document.createElement('label'); el.className = 'node wb-switch';
      el.setAttribute('aria-label', node.name || 'Переключатель');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.checked = !!node.checked; checkbox.disabled = !interactive || !!node.mqtt?.statusTopic;
      const toggle = document.createElement('span'); toggle.className = 'switch-ui';
      el.append(checkbox, toggle);
    } else if (node.type === 'slider') {
      el = document.createElement('div'); el.className = 'node wb-slider';
      const caption = document.createElement('div'); caption.className = 'slider-caption';
      const label = document.createElement('span'); label.textContent = node.text;
      const value = document.createElement('span'); value.className = 'slider-value'; value.textContent = String(node.value);
      caption.append(label, value);
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(node.min ?? 0); slider.max = String(node.max ?? 100); slider.step = String(node.step ?? 1); slider.value = String(node.value);
      slider.disabled = !interactive || !!node.mqtt?.statusTopic;
      slider.addEventListener('input', () => { value.textContent = slider.value; });
      el.append(caption, slider);
    } else if (node.type === 'image') {
      el = document.createElement('img'); el.className = 'node wb-image';
      if (node.src) el.src = node.src;
      else { el.alt = 'Изображение не выбрано'; el.classList.add('image-empty'); }
      el.alt = node.name || 'Изображение';
      el.draggable = false;
    } else if (node.type === 'text') {
      el = document.createElement('div'); el.className = 'node node-text'; el.textContent = node.text;
    } else {
      el = document.createElement('div'); el.className = 'node node-container';
      node.children.forEach((child, idx) => el.appendChild(createElement(child, options, node, idx)));
      if (!interactive && node.children.length === 0) el.classList.add('empty-container');
    }
    el.dataset.nodeId = node.id;
    if (!interactive && node.id === selectedId) el.classList.add('selected-node');
    applyNodeStyle(el, node, parent, index);
    return el;
  }

  window.WBPanelRenderer = Object.freeze({ createElement });
})();
