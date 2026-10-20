/* WB Panel — отрисовка дерева, холста и библиотеки шаблонов. */
(() => {
  'use strict';
  const { $, svg, esc, STYLE_KEYS } = window.WBPanelModel;
  window.WBPanelCreateView = (ctx) => {
    const state = ctx.state;
    const collapsed = ctx.collapsed;
    const showToast = ctx.showToast;
  function renderTemplates() {
    const list = $('#templatesList');
    if (!state.templates.length) {
      list.innerHTML = '<p class="state.templates-empty">Пока нет шаблонов</p>';
      return;
    }
    list.innerHTML = state.templates.map(t => `<div class="template-item" draggable="true" data-template="${esc(t.id)}" title="Перетащите на страницу или в дерево">
      <span class="template-icon">${svg(t.node.type)}</span><span class="template-name">${esc(t.name)}</span>
      <button class="template-delete" data-template-delete="${esc(t.id)}" type="button" title="Удалить шаблон">×</button></div>`).join('');
  }
  function renderIcons() {
    document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = svg(el.dataset.icon));
  }

  function renderTree() {
    function row(node, depth) {
      const children = node.type === 'container' ? node.children : null;
      const isCollapsed = collapsed.has(node.id);
      const indent = '<span class="tree-indent"></span>'.repeat(depth);
      const toggle = children ? `<button type="button" class="tree-expander" data-expand="${esc(node.id)}" aria-label="Свернуть или раскрыть">${isCollapsed ? '▸' : '▾'}</button>` : '<span class="tree-expander"></span>';
      const item = `<div class="tree-row ${state.selectedId === node.id ? 'selected' : ''}" draggable="${node.id !== state.project.root.id}" data-tree="${esc(node.id)}">${indent}${toggle}<span class="tree-icon">${svg(node.type)}</span><span class="tree-label" title="${esc(node.name)}">${esc(node.name)}</span></div>`;
      return item + (!isCollapsed && children ? children.map(c => row(c, depth + 1)).join('') : '');
    }
    $('#tree').innerHTML = row(state.project.root, 0);
  }

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

  function createElement(node, parent = null, index = 0) {
    let el;
    if (node.type === 'button') {
      el = document.createElement('button'); el.type = 'button';
      el.className = 'node wb-button'; el.textContent = node.text;
      if (!state.preview) el.tabIndex = -1;
      else el.addEventListener('click', () => {
        el.classList.toggle('is-active');
        showToast('Демонстрация: команда MQTT не отправлялась');
      });
    } else if (node.type === 'switch') {
      el = document.createElement('label'); el.className = 'node wb-switch';
      el.setAttribute('aria-label', node.name || 'Переключатель');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.checked = !!node.checked; checkbox.disabled = !state.preview;
      const toggle = document.createElement('span'); toggle.className = 'switch-ui';
      el.append(checkbox, toggle);
    } else if (node.type === 'slider') {
      el = document.createElement('div'); el.className = 'node wb-slider';
      const caption = document.createElement('div'); caption.className = 'slider-caption';
      const label = document.createElement('span'); label.textContent = node.text;
      const value = document.createElement('span'); value.className = 'slider-value'; value.textContent = String(node.value);
      caption.append(label, value);
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(node.min ?? 0); slider.max = String(node.max ?? 100); slider.step = String(node.step ?? 1); slider.value = String(node.value);
      slider.disabled = !state.preview;
      slider.addEventListener('input', () => { value.textContent = slider.value; });
      el.append(caption, slider);
    } else if (node.type === 'text') {
      el = document.createElement('div'); el.className = 'node node-text'; el.textContent = node.text;
    } else {
      el = document.createElement('div'); el.className = 'node node-container';
      node.children.forEach((child, idx) => el.appendChild(createElement(child, node, idx)));
      if (!state.preview && node.children.length === 0) el.classList.add('empty-container');
    }
    el.dataset.nodeId = node.id;
    if (!state.preview && node.id === state.selectedId) el.classList.add('selected-node');
    applyNodeStyle(el, node, parent, index);
    return el;
  }

  function renderCanvas() {
    const canvas = $('#canvas');
    canvas.className = state.preview ? 'page-surface canvas-state.preview' : 'page-surface canvas-edit';
    canvas.replaceChildren(createElement(state.project.root));
  }


    return { renderTemplates, renderIcons, renderTree, renderCanvas };
  };
})();
