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

  // Холст редактора и отдельный viewer используют один рендерер.
  function renderCanvas() {
    const canvas = $('#canvas');
    canvas.className = state.preview ? 'page-surface canvas-state.preview' : 'page-surface canvas-edit';
    canvas.replaceChildren(window.WBPanelRenderer.createElement(state.project.root, {
      interactive: state.preview,
      selectedId: state.preview ? null : state.selectedId,
      onDemoAction: () => showToast('Демонстрация: команда MQTT не отправлялась')
    }));
  }


    return { renderTemplates, renderIcons, renderTree, renderCanvas };
  };
})();
