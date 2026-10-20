/* WB Panel: автономный прототип. Только HTML, CSS и JavaScript. */
(() => {
  'use strict';

  const STORAGE_KEY = 'wb-panel-demo-v3';
  const PREVIOUS_STORAGE_KEY = 'wb-panel-demo-v2';
  const TEMPLATES_KEY = 'wb-panel-templates-v3';
  const LEGACY_STORAGE_KEY = 'wb-panel-demo-v1';
  const ALLOWED_TYPES = new Set(['container', 'text', 'button', 'switch', 'slider']);
  const STYLE_KEYS = new Set([
    'display', 'flexDirection', 'justifyContent', 'alignItems', 'flexWrap',
    'width', 'height', 'backgroundColor', 'color', 'borderRadius',
    'borderWidth', 'borderColor', 'fontSize', 'fontWeight', 'textAlign',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'left', 'top', 'position'
  ]);
  const TYPE_NAMES = {
    container: 'Контейнер', text: 'Текст', button: 'Кнопка',
    switch: 'Переключатель', slider: 'Ползунок'
  };
  const ICON_PATHS = {
    container: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    text: '<path d="M4 7V4h16v3M12 4v16M8 20h8"/>',
    button: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M9 12h6"/>',
    switch: '<rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="15.5" cy="12" r="4"/>',
    slider: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="16" cy="17" r="3" fill="white"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    undo: '<path d="M3 7v5h5"/><path d="M3 12a9 9 0 1 1 3 6"/>',
    redo: '<path d="M21 7v5h-5"/><path d="M21 12a9 9 0 1 0-3 6"/>',
    upload: '<path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 3v13m0 0-5-5m5 5 5-5"/><path d="M4 17v4h16v-4"/>',
    new: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="m16 4 4 4L9 19H5v-4L16 4Z"/><path d="M14 6l4 4"/>',
    up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    down: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
    duplicate: '<rect x="3" y="5" width="12" height="12" rx="2"/><path d="M15 8h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-2"/><path d="M9 9v5M6.5 11.5h5"/>',
    bookmark: '<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z"/>',
    paste: '<rect x="7" y="5" width="14" height="17" rx="2"/><path d="M9 5V3h10v2M3 7v12"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    trash: '<path d="M4 7h16m-10-3h4m-8 3 1 14h10l1-14M10 11v6m4-6v6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>'
  };
  const svg = (kind) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[kind] || ICON_PATHS.container}</svg>`;
  const $ = (selector) => document.querySelector(selector);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const deepCopy = (value) => JSON.parse(JSON.stringify(value));
  const uid = () => 'el_' + Math.random().toString(36).slice(2, 10);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

  // Обычное скругление: 0–50px. Отдельный режим максимально круглых
  // углов использует большой CSS-радиус: квадрат становится кругом,
  // прямоугольник — капсулой, без эллиптических углов от процентов.
  const FULL_RADIUS = '9999px';
  function normalizeRadius(value) {
    if (String(value).trim() === FULL_RADIUS) return FULL_RADIUS;
    return Math.round(clamp(parseFloat(value) || 0, 0, 50)) + 'px';
  }

  function baseStyle() {
    return {
      width: 'auto', height: 'auto',
      marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px',
      paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px',
      backgroundColor: 'transparent', borderWidth: '0px',
      borderColor: '#d7e1ee', borderRadius: '0px'
    };
  }

  function createNode(type) {
    const common = {id: uid(), type, name: TYPE_NAMES[type], style: baseStyle()};
    switch (type) {
      case 'container':
        return {...common, children: [], style: {...common.style,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
          alignItems: 'stretch', width: '100%',
          paddingTop: '18px', paddingRight: '18px', paddingBottom: '18px', paddingLeft: '18px',
          backgroundColor: '#f4f7fc', borderRadius: '12px'
        }};
      case 'text':
        return {...common, text: 'Новый текст', style: {...common.style,
          fontSize: '16px', fontWeight: '400', color: '#243450', textAlign: 'left'
        }};
      case 'button':
        return {...common, text: 'Нажать', style: {...common.style,
          backgroundColor: '#3466e8', color: '#ffffff', borderRadius: '10px', fontSize: '14px'
        }};
      case 'switch':
        return {...common, checked: false, style: {...common.style,
          width: '43px', height: '25px'
        }};
      case 'slider':
        return {...common, text: 'Уровень', value: 50, min: 0, max: 100, step: 1,
          style: {...common.style, width: '100%', color: '#37455f', fontSize: '14px'
        }};
    }
    throw Error('Неизвестный элемент');
  }

  function setSpacing(node, kind, top, right = top, bottom = top, left = right) {
    for (const [side, val] of Object.entries({Top:top, Right:right, Bottom:bottom, Left:left})) {
      node.style[kind + side] = String(val) + 'px';
    }
  }

  function createDemo() {
    const page = createNode('container');
    page.id = 'page'; page.name = 'Страница';
    Object.assign(page.style, { backgroundColor: '#ffffff', borderRadius: '0px' });
    setSpacing(page, 'padding', 34);
    const heading = createNode('text'); heading.name = 'Заголовок'; heading.text = 'Панель управления';
    Object.assign(heading.style, {fontSize:'29px',fontWeight:'700',color:'#1b2942'});
    setSpacing(heading,'margin',0,0,15,0);
    const subheading = createNode('text'); subheading.name = 'Описание';
    subheading.text = 'Пример панели из контейнеров, кнопок и простых элементов.';
    Object.assign(subheading.style, {fontSize:'13px',color:'#8190a5'});
    setSpacing(subheading, 'margin', 0,0,25,0);
    const row = createNode('container'); row.name = 'Карточки';
    Object.assign(row.style, {flexDirection:'row',alignItems:'stretch',paddingTop:'0px',paddingRight:'0px',paddingBottom:'0px',paddingLeft:'0px',backgroundColor:'transparent'});
    const card1 = createNode('container'); card1.name = 'Освещение';
    Object.assign(card1.style, {width:'48%',backgroundColor:'#f2f6ff',borderRadius:'16px'});
    setSpacing(card1,'padding',23);
    setSpacing(card1,'margin',0,15,0,0);
    const t1 = createNode('text'); t1.text = 'Освещение'; t1.name='Название';
    Object.assign(t1.style, {fontWeight:'700',fontSize:'19px'});
    setSpacing(t1,'margin',0,0,17,0);
    const t2 = createNode('text'); t2.text = 'Гостиная · основной свет'; t2.name='Описание';
    Object.assign(t2.style, {fontSize:'13px',color:'#8695ae'});
    setSpacing(t2,'margin',0,0,18,0);
    const b = createNode('button'); b.text = 'Включить свет'; b.name = 'Кнопка света';
    Object.assign(b.style, {width:'170px'});
    card1.children.push(t1, t2, b);
    const card2 = createNode('container'); card2.name='Климат';
    Object.assign(card2.style, {width:'48%',backgroundColor:'#f2f6ff',borderRadius:'16px'});
    setSpacing(card2,'padding',23);
    const t3 = createNode('text'); t3.text = 'Климат'; t3.name='Название';
    Object.assign(t3.style, {fontWeight:'700',fontSize:'19px'});
    setSpacing(t3,'margin',0,0,17,0);
    const swLabel = createNode('text'); swLabel.name='Подпись вентиляции'; swLabel.text='Вентиляция';
    Object.assign(swLabel.style,{fontSize:'13px', color:'#687991'});
    setSpacing(swLabel,'margin',0,0,7,0);
    const sw = createNode('switch'); sw.name='Переключатель вентиляции'; sw.checked=true;
    setSpacing(sw,'margin',0,0,14,0);
    const sl = createNode('slider'); sl.text='Мощность'; sl.name='Мощность'; sl.value=45;
    card2.children.push(t3, swLabel, sw, sl);
    row.children.push(card1,card2);
    page.children.push(heading,subheading,row);
    return { version: 3, title: 'Моя панель', root: page };
  }

  // Импорт ограничен небольшим поддерживаемым набором элементов и CSS-свойств.
  function normalizeProject(parsed) {
    if (!parsed || typeof parsed !== 'object' || !parsed.root) throw Error('Нет корневого контейнера');
    let count = 0;
    const ids = new Set();
    const legacy = Number(parsed.version) < 2;
    const normalizeNode = (source, depth = 0) => {
      if (!source || typeof source !== 'object' || !ALLOWED_TYPES.has(source.type)) throw Error('Неизвестный тип элемента');
      if (depth > 20 || ++count > 400) throw Error('Слишком большой проект');
      const node = createNode(source.type);
      const sourceId = typeof source.id === 'string' && /^[\w-]{1,80}$/.test(source.id) ? source.id : uid();
      node.id = ids.has(sourceId) ? uid() : sourceId;
      ids.add(node.id);
      node.name = typeof source.name === 'string' ? source.name.slice(0, 150) : node.name;
      if ('text' in node) node.text = typeof source.text === 'string' ? source.text.slice(0, 10000) : node.text;
      if (node.type === 'switch') node.checked = !!source.checked;
      if (node.type === 'slider') {
        node.min = clamp(source.min ?? 0, -10000, 10000);
        node.max = clamp(source.max ?? 100, node.min + 1, 10001);
        node.step = clamp(source.step ?? 1, 1, 10000);
        node.value = clamp(source.value ?? 50, node.min, node.max);
      }
      if (source.style && typeof source.style === 'object' && !Array.isArray(source.style)) {
        for (const [k, v] of Object.entries(source.style)) {
          if (STYLE_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length <= 120) {
            node.style[k] = String(v);
          }
        }
        // Единый формат для новых и прежних проектов: только px.
        node.style.borderRadius = normalizeRadius(node.style.borderRadius);
        if (legacy) {
          for (const kind of ['margin','padding']) {
            const raw = source.style[kind];
            if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?px$/.test(raw)) continue;
            for (const side of ['Top','Right','Bottom','Left']) node.style[kind + side] = raw;
          }
        }
      }
      if (node.type === 'container') {
        node.children = (Array.isArray(source.children) ? source.children : []).map(ch => normalizeNode(ch, depth + 1));
        // Старые проекты с gap открываются без потери промежутков между элементами.
        if (legacy && source.style && /^\d+(?:\.\d+)?px$/.test(source.style.gap || '')) {
          const gap = parseFloat(source.style.gap);
          const side = node.style.flexDirection === 'row' ? 'marginRight' : 'marginBottom';
          node.children.slice(0,-1).forEach(child => {
            child.style[side] = (parseFloat(child.style[side]) + gap) + 'px';
          });
        }
      }
      return node;
    };
    if (parsed.root.type !== 'container') throw Error('Корнем проекта должен быть контейнер');
    return {version: 3, title: typeof parsed.title === 'string' ? parsed.title.slice(0,120) : 'Моя панель', root: normalizeNode(parsed.root)};
  }

  function loadInitialProject() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PREVIOUS_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) return normalizeProject(JSON.parse(raw));
    } catch (error) { console.warn('Не удалось прочитать сохранённый проект:', error); }
    return createDemo();
  }

  let project = loadInitialProject();
  let selectedId = project.root.id;
  let preview = false;
  let undoStack = [], redoStack = [];
  let baselineOnFocus = null;
  let clipboardNode = null;
  let dragPayload = null;
  let activeDrop = null;
  let templates = loadTemplates();
  const collapsed = new Set();
  let toastTimer = null;

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
    catch (e) { $('#saveStatus').textContent = 'Не удалось сохранить в браузере'; }
  }
  function loadTemplates() {
    try {
      const data = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data.slice(0, 30).flatMap(item => {
        try {
          if (!item || typeof item.name !== 'string') return [];
          return [{id: String(item.id).slice(0,80), name:item.name.slice(0,80), node: validateSnippet(item.node)}];
        } catch { return []; }
      });
    } catch { return []; }
  }
  function saveTemplates() {
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)); }
    catch { showToast('Не удалось сохранить шаблоны в браузере'); }
  }
  function validateSnippet(node) {
    const root = createNode('container');
    root.children = [node];
    return normalizeProject({version:3, root}).root.children[0];
  }
  function renderTemplates() {
    const list = $('#templatesList');
    if (!templates.length) {
      list.innerHTML = '<p class="templates-empty">Пока нет шаблонов</p>';
      return;
    }
    list.innerHTML = templates.map(t => `<div class="template-item" draggable="true" data-template="${esc(t.id)}" title="Перетащите на страницу или в дерево">
      <span class="template-icon">${svg(t.node.type)}</span><span class="template-name">${esc(t.name)}</span>
      <button class="template-delete" data-template-delete="${esc(t.id)}" type="button" title="Удалить шаблон">×</button></div>`).join('');
  }
  function nodeCount(node) { return 1 + (node.type === 'container' ? node.children.reduce((n,c) => n + nodeCount(c), 0) : 0); }
  function nodeHeight(node) { return node.type === 'container' ? 1 + Math.max(0,...node.children.map(nodeHeight)) : 1; }
  function ancestorDepth(id, node = project.root, depth = 0) {
    if (node.id === id) return depth;
    if (node.type !== 'container') return -1;
    for (const child of node.children) {
      const result = ancestorDepth(id, child, depth + 1);
      if (result !== -1) return result;
    }
    return -1;
  }
  function containsNode(node,id) {
    return node.id === id || (node.type === 'container' && node.children.some(ch => containsNode(ch,id)));
  }
  function locate(id, node = project.root, parent = null) {
    if (node.id === id) return { node, parent, index: parent ? parent.children.indexOf(node) : -1 };
    if (node.type === 'container') {
      for (const child of node.children) {
        const result = locate(id, child, node);
        if (result) return result;
      }
    }
    return null;
  }
  function pushUndo(snapshot = JSON.stringify(project)) {
    if (undoStack[undoStack.length - 1] === snapshot) return;
    undoStack.push(snapshot);
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
  }
  function applySnapshot(snapshot) {
    project = normalizeProject(JSON.parse(snapshot));
    if (!locate(selectedId)) selectedId = project.root.id;
    renderAll();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(project));
    applySnapshot(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(project));
    applySnapshot(redoStack.pop());
  }
  function showToast(msg) {
    const toast = $('#toast');
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
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
      const item = `<div class="tree-row ${selectedId === node.id ? 'selected' : ''}" draggable="${node.id !== project.root.id}" data-tree="${esc(node.id)}">${indent}${toggle}<span class="tree-icon">${svg(node.type)}</span><span class="tree-label" title="${esc(node.name)}">${esc(node.name)}</span></div>`;
      return item + (!isCollapsed && children ? children.map(c => row(c, depth + 1)).join('') : '');
    }
    $('#tree').innerHTML = row(project.root, 0);
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
      if (!preview) el.tabIndex = -1;
      else el.addEventListener('click', () => {
        el.classList.toggle('is-active');
        showToast('Демонстрация: команда MQTT не отправлялась');
      });
    } else if (node.type === 'switch') {
      el = document.createElement('label'); el.className = 'node wb-switch';
      el.setAttribute('aria-label', node.name || 'Переключатель');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.checked = !!node.checked; checkbox.disabled = !preview;
      const toggle = document.createElement('span'); toggle.className = 'switch-ui';
      el.append(checkbox, toggle);
    } else if (node.type === 'slider') {
      el = document.createElement('div'); el.className = 'node wb-slider';
      const caption = document.createElement('div'); caption.className = 'slider-caption';
      const label = document.createElement('span'); label.textContent = node.text;
      const value = document.createElement('span'); value.className = 'slider-value'; value.textContent = String(node.value);
      caption.append(label, value);
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(node.min ?? 0); slider.max = String(node.max ?? 100); slider.step = String(node.step ?? 1); slider.value = String(node.value);
      slider.disabled = !preview;
      slider.addEventListener('input', () => { value.textContent = slider.value; });
      el.append(caption, slider);
    } else if (node.type === 'text') {
      el = document.createElement('div'); el.className = 'node node-text'; el.textContent = node.text;
    } else {
      el = document.createElement('div'); el.className = 'node node-container';
      node.children.forEach((child, idx) => el.appendChild(createElement(child, node, idx)));
      if (!preview && node.children.length === 0) el.classList.add('empty-container');
    }
    el.dataset.nodeId = node.id;
    if (!preview && node.id === selectedId) el.classList.add('selected-node');
    applyNodeStyle(el, node, parent, index);
    return el;
  }

  function renderCanvas() {
    const canvas = $('#canvas');
    canvas.className = preview ? 'page-surface canvas-preview' : 'page-surface canvas-edit';
    canvas.replaceChildren(createElement(project.root));
  }

  const TIPS = {
    name: 'Название для списка элементов слева. На самой панели оно не отображается.',
    width: 'Ширина элемента: автоматически, в пикселях или в процентах от ширины родителя.',
    height: 'Высота элемента: автоматически, в пикселях или в процентах от высоты родителя.',
    margin: 'Внешнее расстояние от элемента до соседних элементов. Можно настроить каждую сторону.',
    padding: 'Расстояние от краёв элемента до его содержимого. Можно настроить каждую сторону.',
    background: 'Цвет фона. Вариант «Прозрачный» убирает заливку.',
    borderWidth: 'Толщина рамки по периметру элемента. Значение 0 отключает рамку.',
    borderColor: 'Цвет рамки. Видно, если толщина рамки больше нуля.',
    borderRadius: 'Обычное скругление — от 0 до 50 px. Режим «Полное скругление» делает квадрат кругом, а прямоугольник капсулой независимо от размеров.',
    x: 'Горизонтальная координата относительно свободного контейнера.',
    y: 'Вертикальная координата относительно свободного контейнера.',
    layout: 'Как располагать элементы внутри контейнера: сверху вниз, слева направо либо в заданных координатах.',
    alignX: 'Как выравнивать элементы по горизонтали: слева, по центру, справа. В некоторых режимах — растянуть или распределить по краям.',
    alignY: 'Как выравнивать элементы по вертикали: сверху, по центру, снизу. В некоторых режимах — растянуть или распределить по краям.',
    text: 'Надпись, которую увидит пользователь на панели.',
    fontSize: 'Размер букв в пикселях.',
    color: 'Цвет текста или подписи элемента.',
    fontWeight: 'Толщина букв: обычные или жирные.',
    textAlign: 'Расположение текста внутри отведённой области.',
    checked: 'Состояние переключателя при открытии демонстрационного просмотра.',
    sliderMin: 'Самое маленькое значение ползунка.',
    sliderMax: 'Самое большое значение ползунка.',
    sliderStep: 'На сколько меняется значение за одно перемещение.',
    sliderValue: 'Положение ползунка при открытии демонстрационного просмотра.'
  };
  function help(label, tip) {
    return `<button type="button" class="help-button" data-help="${esc(tip)}" aria-label="Подсказка: ${esc(label)}">i</button>`;
  }
  function field(label, prop, value, opts = {}) {
    const type = opts.type || 'text';
    const id = 'prop-' + prop.replace(/[^a-zA-Z0-9_-]/g,'-');
    let control;
    if (type === 'select') {
      control = `<select id="${id}" class="field-select" data-prop="${esc(prop)}">${opts.options.map(([v,n]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    } else if (type === 'textarea') {
      control = `<textarea id="${id}" class="field-textarea" data-prop="${esc(prop)}">${esc(value)}</textarea>`;
    } else if (type === 'checkbox') {
      control = `<label class="checkbox-field"><input id="${id}" type="checkbox" data-prop="${esc(prop)}" ${value ? 'checked' : ''}> Включено</label>`;
    } else if (type === 'color') {
      const color = /^#[a-f\d]{6}$/i.test(String(value)) ? value : '#ffffff';
      control = `<div class="color-control"><input id="${id}" type="color" data-prop="${esc(prop)}" value="${esc(color)}" aria-label="${esc(label)}"><span class="color-value">${esc(color.toUpperCase())}</span></div>`;
    } else {
      control = `<input id="${id}" class="field-input" data-prop="${esc(prop)}" type="${type}" value="${esc(value)}" ${type === 'number' ? `step="${opts.step || '1'}" ${opts.signed ? '' : 'min="0"'} max="99999"` : ''}>`;
    }
    return `<div class="field"><div class="field-heading"><label class="field-label" for="${id}">${esc(label)}</label>${help(label,opts.tip || '')}</div>${control}</div>`;
  }
  const expandedGroups = new Set(['Основное','Размеры','Контейнер','Текст','Кнопка','Переключатель','Ползунок']);
  const section = (label, content) => `<details class="prop-section" data-group="${esc(label)}" ${expandedGroups.has(label) ? 'open' : ''}><summary>${esc(label)}</summary><div class="prop-section-content">${content}</div></details>`;
  function sizeField(label, key, raw) {
    const parsed = /^([0-9]+(?:\.[0-9]+)?)(px|%)$/.exec(String(raw));
    const unit = parsed ? parsed[2] : 'auto';
    const number = parsed ? parsed[1] : '';
    return `<div class="field"><div class="field-heading"><span class="field-label">${esc(label)}</span>${help(label,TIPS[key])}</div><div class="size-control"><input class="field-input" type="number" step="1" min="0" max="99999" value="${esc(number)}" aria-label="${esc(label)} — число" data-size-number="style.${esc(key)}" ${unit === 'auto' ? 'disabled' : ''}><select class="field-select" data-size-unit="style.${esc(key)}" aria-label="${esc(label)} — единица">${[['auto','Авто'],['px','px'],['%','%']].map(([v,n]) => `<option value="${v}" ${unit === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>`;
  }
  function radiusField(raw) {
    const full = normalizeRadius(raw) === FULL_RADIUS;
    const value = full ? 50 : parseInt(normalizeRadius(raw), 10);
    return `<div class="field"><div class="field-heading"><label class="field-label" for="radiusRange">Скругление</label>${help('Скругление',TIPS.borderRadius)}</div>
      <div class="radius-row"><input id="radiusRange" class="radius-range" data-prop="style.borderRadius" type="range" min="0" max="50" step="1" value="${value}" ${full ? 'disabled' : ''}>
      <output class="radius-value" for="radiusRange">${full ? 'Макс.' : value + 'px'}</output></div>
      <label class="checkbox-field transparent-switch"><input type="checkbox" data-prop="radiusFull" ${full ? 'checked' : ''}> Полное скругление</label></div>`;
  }
  function spacingFields(kind,label) {
    const node = locate(selectedId).node;
    const sides = [['Top','Верх'],['Right','Право'],['Bottom','Низ'],['Left','Лево']];
    const controls = sides.map(([side,sideLabel]) => {
      const prop = 'style.' + kind + side;
      const v = parseFloat(node.style[kind + side] || '0') || 0;
      return `<label class="spacing-cell"><span>${sideLabel}</span><input class="field-input" type="number" min="0" max="9999" data-prop="${prop}" value="${v}" aria-label="${esc(label)}: ${sideLabel.toLowerCase()}"></label>`;
    }).join('');
    return `<div class="field"><div class="field-heading"><span class="field-label">${esc(label)}</span>${help(label,TIPS[kind])}</div><div class="spacing-grid">${controls}</div></div>`;
  }
  function backgroundField(value) {
    const transparent = !value || value === 'transparent';
    const color = /^#[a-f\d]{6}$/i.test(String(value)) ? String(value) : '#ffffff';
    return `<div class="field"><div class="field-heading"><label class="field-label" for="bgColor">Цвет фона</label>${help('Цвет фона',TIPS.background)}</div><div class="color-control"><input type="color" id="bgColor" data-prop="style.backgroundColor" value="${esc(color)}" ${transparent ? 'disabled' : ''}><span class="color-value">${esc(transparent ? 'Без заливки' : color.toUpperCase())}</span></div><label class="checkbox-field transparent-switch"><input type="checkbox" data-bg-transparent="1" ${transparent ? 'checked' : ''}> Прозрачный фон</label></div>`;
  }
  const layoutOptions = [['column','Вертикально'],['row','Горизонтально'],['free','Свободно']];
  const justifyXOptions = [['flex-start','Слева'],['center','Центр'],['flex-end','Справа'],['space-between','По краям']];
  const alignXOptions = [['flex-start','Слева'],['center','Центр'],['flex-end','Справа'],['stretch','Растянуть']];
  const justifyYOptions = [['flex-start','Сверху'],['center','Центр'],['flex-end','Снизу'],['space-between','По краям']];
  const alignYOptions = [['flex-start','Сверху'],['center','Центр'],['flex-end','Снизу'],['stretch','Растянуть']];
  function currentLayout(node) { return node.style.display === 'block' ? 'free' : node.style.flexDirection === 'row' ? 'row' : 'column'; }

  function renderProperties() {
    const info = locate(selectedId);
    if (!info) return;
    const {node,parent,index} = info;
    $('#selectedTitle').innerHTML = `${svg(node.type)}<span>${esc(node.name)}</span>`;
    const isRoot = !parent;
    const parentIsFree = !!parent && parent.style.display === 'block';
    $('#elementActions').querySelectorAll('[data-action]').forEach(b => {
      const a = b.dataset.action;
      b.disabled = (isRoot && ['up','down','duplicate','delete'].includes(a)) || (a === 'paste' && !clipboardNode) || (!isRoot && a === 'up' && index <= 0) || (!isRoot && a === 'down' && index === parent.children.length - 1);
    });
    let html = section('Основное', field('Название в структуре','name',node.name,{tip:TIPS.name}));
    html += section('Размеры', sizeField('Ширина','width',node.style.width || 'auto') + sizeField('Высота','height',node.style.height || 'auto'));
    html += section('Отступы', spacingFields('margin','Внешние') + spacingFields('padding','Внутренние'));
    html += section('Фон', backgroundField(node.style.backgroundColor));
    html += section('Граница',
      field('Толщина, px','style.borderWidth',parseFloat(node.style.borderWidth) || 0,{type:'number',tip:TIPS.borderWidth}) +
      field('Цвет границы','style.borderColor',node.style.borderColor || '#d7e1ee',{type:'color',tip:TIPS.borderColor}) +
      radiusField(node.style.borderRadius || '0px'));
    if (parentIsFree) {
      html += section('Положение', `<div class="field-row">${field('Координата X, px','style.left',Number.parseFloat(node.style.left ?? '16'),{type:'number',signed:true,tip:TIPS.x})}${field('Координата Y, px','style.top',Number.parseFloat(node.style.top ?? String(16 + index*58)),{type:'number',signed:true,tip:TIPS.y})}</div>`);
    }
    if (node.type === 'container') {
      const layout = currentLayout(node);
      let specific = field('Позиционирование','layoutMode',layout,{type:'select',options:layoutOptions,tip:TIPS.layout});
      if (layout !== 'free') {
        const horiz = layout === 'row';
        const xProp = horiz ? 'style.justifyContent' : 'style.alignItems';
        const yProp = horiz ? 'style.alignItems' : 'style.justifyContent';
        const xOptions = horiz ? justifyXOptions : alignXOptions;
        const yOptions = horiz ? alignYOptions : justifyYOptions;
        specific += `<div class="field-row">${field('По оси X',xProp,node.style[xProp.slice(6)] || 'flex-start',{type:'select',options:xOptions,tip:TIPS.alignX})}${field('По оси Y',yProp,node.style[yProp.slice(6)] || 'flex-start',{type:'select',options:yOptions,tip:TIPS.alignY})}</div>`;
      } else {
        specific += '<p class="field-note">Во вложенных элементах появятся координаты X и Y.</p>';
      }
      html += section('Контейнер',specific);
    } else {
      let specific = '';
      if (node.type === 'text' || node.type === 'button' || node.type === 'slider') {
        specific = field(node.type === 'text' ? 'Содержимое' : 'Подпись','text',node.text,{type:node.type === 'text' ? 'textarea' : 'text',tip:TIPS.text});
      }
      if (node.type === 'text' || node.type === 'button' || node.type === 'slider') {
        specific += `<div class="field-row">${field('Размер шрифта, px','style.fontSize',parseFloat(node.style.fontSize) || 14,{type:'number',tip:TIPS.fontSize})}${field('Цвет текста','style.color',node.style.color || '#243450',{type:'color',tip:TIPS.color})}</div>`;
      }
      if (node.type === 'text') {
        specific += field('Начертание','style.fontWeight',node.style.fontWeight || '400',{type:'select',options:[['400','Обычное'],['700','Жирное']],tip:TIPS.fontWeight});
        specific += field('Выравнивание текста','style.textAlign',node.style.textAlign || 'left',{type:'select',options:[['left','Слева'],['center','По центру'],['right','Справа']],tip:TIPS.textAlign});
      } else if (node.type === 'switch') {
        specific += field('Начальное состояние','checked',node.checked,{type:'checkbox',tip:TIPS.checked});
      } else if (node.type === 'slider') {
        specific += `<div class="field-row">${field('Минимум','min',node.min ?? 0,{type:'number',signed:true,tip:TIPS.sliderMin})}${field('Максимум','max',node.max ?? 100,{type:'number',signed:true,tip:TIPS.sliderMax})}</div>`;
        specific += `<div class="field-row">${field('Шаг','step',node.step ?? 1,{type:'number',tip:TIPS.sliderStep})}${field('Начальное значение','value',node.value ?? 50,{type:'number',signed:true,tip:TIPS.sliderValue})}</div>`;
      }
      html += section(TYPE_NAMES[node.type],specific);
    }
    $('#properties').innerHTML = html;
  }

  function refreshTop() {
    $('#projectTitle').textContent = project.title;
    $('#undoBtn').disabled = undoStack.length === 0;
    $('#redoBtn').disabled = redoStack.length === 0;
    document.body.classList.toggle('is-preview',preview);
    $('#modeLabel').textContent = preview ? 'В редактор' : 'Просмотр';
    $('#modeBtn').querySelector('[data-icon]').innerHTML = svg(preview ? 'edit' : 'eye');
    $('#canvasBadge').textContent = preview ? 'ПРОСМОТР' : 'РЕДАКТИРОВАНИЕ';
    $('#previewNotice').hidden = !preview;
  }
  function renderAll() {
    renderTree(); renderCanvas(); renderProperties(); renderTemplates(); refreshTop(); saveLocal();
  }
  function setSelected(id) {
    if (!locate(id)) return;
    selectedId = id;
    renderTree(); renderCanvas(); renderProperties();
  }

  function reseedIds(node) {
    node.id = uid();
    if (node.type === 'container') node.children.forEach(reseedIds);
  }
  function actOnSelection(action) {
    const info = locate(selectedId);
    if (!info || !info.parent) return;
    const {node,parent,index} = info;
    if (action === 'up' && index <= 0 || action === 'down' && index >= parent.children.length - 1) return;
    pushUndo();
    if (action === 'delete') {
      parent.children.splice(index,1); selectedId = parent.id;
    } else if (action === 'duplicate') {
      const clone = deepCopy(node); reseedIds(clone);
      parent.children.splice(index + 1, 0, clone); selectedId = clone.id;
    } else {
      const idx = action === 'up' ? index - 1 : index + 1;
      [parent.children[index],parent.children[idx]] = [parent.children[idx],parent.children[index]];
    }
    renderAll();
  }

  // Буфер копирования и шаблоны хранят полное поддерево компонента.
  function copySelection() {
    const info = locate(selectedId);
    if (!info) return;
    clipboardNode = deepCopy(info.node);
    renderProperties();
    showToast('Элемент скопирован. Выберите контейнер и нажмите «Вставить»');
  }

  function saveSelectionAsTemplate() {
    const info = locate(selectedId);
    if (!info) return;
    const title = prompt('Название шаблона', info.node.name || TYPE_NAMES[info.node.type]);
    if (title === null) return;
    const name = title.trim().slice(0,80);
    if (!name) return showToast('Введите название шаблона');
    if (templates.length >= 30) return showToast('Можно сохранить не больше 30 шаблонов');
    templates.push({id:uid(), name, node:deepCopy(info.node)});
    saveTemplates(); renderTemplates();
    showToast('Шаблон сохранён вместе со вложенными элементами');
  }

  function selectedInsertionPoint() {
    const info = locate(selectedId);
    if (!info) return null;
    if (info.node.type === 'container') return {parentId: info.node.id, index:info.node.children.length};
    return {parentId:info.parent.id, index:info.index + 1};
  }

  function insertAt(destination, payload) {
    if (!destination || !payload) return false;
    const dest = locate(destination.parentId);
    if (!dest || dest.node.type !== 'container') return false;
    let node;
    let moving = false;
    let sourceInfo = null;
    if (payload.kind === 'node') {
      sourceInfo = locate(payload.id);
      if (!sourceInfo || !sourceInfo.parent) return false; // Страница не перемещается.
      node = sourceInfo.node;
      moving = true;
      if (containsNode(node, dest.node.id)) {
        showToast('Нельзя перенести контейнер внутрь самого себя');
        return false;
      }
    } else if (payload.kind === 'new') {
      if (!ALLOWED_TYPES.has(payload.type)) return false;
      node = createNode(payload.type);
    } else if (payload.kind === 'template' || payload.kind === 'clipboard') {
      const source = payload.kind === 'clipboard' ? clipboardNode : templates.find(t=>t.id===payload.id)?.node;
      if (!source) return false;
      try { node = validateSnippet(source); } catch { showToast('Некорректный шаблон'); return false; }
      reseedIds(node);
    } else return false;

    if (ancestorDepth(dest.node.id) + nodeHeight(node) > 20) {
      showToast('Слишком глубокая вложенность (не более 20 уровней)');
      return false;
    }
    if (!moving && nodeCount(project.root) + nodeCount(node) > 400) {
      showToast('Слишком много элементов (не более 400)');
      return false;
    }
    const newIndex = clamp(destination.index,0,dest.node.children.length);
    if (moving && sourceInfo.parent === dest.node && (newIndex === sourceInfo.index || newIndex === sourceInfo.index + 1)) return false;
    pushUndo();
    if (moving) {
      sourceInfo.parent.children.splice(sourceInfo.index, 1);
    }
    const adjustedIndex = moving && sourceInfo.parent === dest.node && sourceInfo.index < newIndex ? newIndex - 1 : newIndex;
    dest.node.children.splice(adjustedIndex,0,node);
    // При переносе в свободный контейнер даём стартовые координаты.
    if (dest.node.style.display === 'block' && (!moving || sourceInfo.parent !== dest.node)) {
      node.style.left ||= '16px';
      node.style.top ||= `${16 + adjustedIndex * 58}px`;
    }
    collapsed.delete(dest.node.id);
    selectedId = node.id;
    renderAll();
    return true;
  }

  function pasteSelection() {
    if (!clipboardNode) return showToast('Сначала скопируйте элемент');
    const target = selectedInsertionPoint();
    if (insertAt(target,{kind:'clipboard'})) showToast('Копия вставлена');
  }

  // HTML5 Drag and Drop: добавление с палитры, перенос в дереве и вставка шаблонов.
  function dragStart(e,payload) {
    if (preview) return;
    dragPayload = payload;
    e.dataTransfer.effectAllowed = payload.kind === 'node' ? 'move' : 'copy';
    e.dataTransfer.setData('text/plain','wb-panel-drag');
    e.dataTransfer.setData('application/x-wb-panel','1');
    e.target.closest('[draggable=true]')?.classList.add('is-drag-source');
    document.body.classList.add('dragging-element');
  }
  function clearDropVisual() {
    if (activeDrop?.element) activeDrop.element.classList.remove('drop-before','drop-after','drop-inside');
    activeDrop = null;
  }
  function resetDrag() {
    clearDropVisual();
    document.querySelectorAll('.is-drag-source').forEach(el => el.classList.remove('is-drag-source'));
    document.body.classList.remove('dragging-element');
    dragPayload = null;
  }
  function resolveDrop(e, area) {
    const target = area === 'tree'
      ? e.target.closest('[data-tree]')
      : e.target.closest('[data-node-id]');
    if (!target) {
      if (area === 'canvas') return {parentId:project.root.id,index:project.root.children.length,element:$('#canvas'),zone:'inside'};
      return null;
    }
    const id = area === 'tree' ? target.dataset.tree : target.dataset.nodeId;
    const info = locate(id);
    if (!info) return null;
    const bounds = target.getBoundingClientRect();
    const fraction = bounds.height ? (e.clientY - bounds.top) / bounds.height : .5;
    let zone;
    if (!info.parent) zone = 'inside';
    else if (area === 'canvas') zone = info.node.type === 'container' ? 'inside' : (fraction < .5 ? 'before' : 'after');
    else if (fraction < .24) zone = 'before';
    else if (fraction > .76) zone = 'after';
    else zone = info.node.type === 'container' ? 'inside' : (fraction < .5 ? 'before' : 'after');
    return zone === 'inside' ? {parentId:info.node.id,index:info.node.children.length,element:target,zone}
      : {parentId:info.parent.id,index:info.index + (zone==='after' ? 1 : 0),element:target,zone};
  }
  function onDragOver(e, area) {
    if (preview || !dragPayload) return;
    const destination = resolveDrop(e,area);
    if (!destination) { clearDropVisual(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = dragPayload.kind === 'node' ? 'move' : 'copy';
    if (activeDrop?.element !== destination.element || activeDrop.zone !== destination.zone) {
      clearDropVisual();
      destination.element.classList.add('drop-' + destination.zone);
    }
    activeDrop = destination;
  }
  function onDrop(e, area) {
    if (!dragPayload || preview) return;
    e.preventDefault();
    const destination = resolveDrop(e,area);
    const payload = dragPayload;
    resetDrag();
    if (insertAt(destination,payload)) {
      showToast(payload.kind === 'node' ? 'Элемент перемещён' : 'Элемент добавлен');
    }
  }

  function updateProperty(target) {
    const path = target.dataset.prop || target.dataset.sizeUnit || target.dataset.sizeNumber;
    if (!path && !target.dataset.bgTransparent) return;
    const info = locate(selectedId);
    if (!info) return;
    const node = info.node;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    if (target.dataset.bgTransparent) {
      node.style.backgroundColor = value ? 'transparent' : '#ffffff';
    } else if (target.dataset.sizeUnit) {
      const control = target.closest('.size-control').querySelector('[data-size-number]');
      if (value === 'auto') node.style[path.slice(6)] = 'auto';
      else node.style[path.slice(6)] = `${clamp(control.value || 100, 0, 99999)}${value}`;
    } else if (target.dataset.sizeNumber) {
      const unit = target.closest('.size-control').querySelector('[data-size-unit]').value;
      node.style[path.slice(6)] = unit === 'auto' ? 'auto' : `${clamp(value,0,99999)}${unit}`;
    } else if (path === 'radiusFull') {
      // При выключении полного скругления возвращаемся к верхней
      // границе обычной шкалы; пользователь может уменьшить её ползунком.
      node.style.borderRadius = value ? FULL_RADIUS : '50px';
    } else if (path === 'layoutMode') {
      if (value === 'free') {
        node.style.display = 'block'; node.style.position = 'relative';
      } else {
        node.style.display = 'flex'; node.style.position = 'static'; node.style.flexDirection = value;
        if (!node.style.justifyContent) node.style.justifyContent = 'flex-start';
        if (!node.style.alignItems) node.style.alignItems = 'stretch';
      }
    } else if (path.startsWith('style.')) {
      const key = path.slice(6);
      if (!STYLE_KEYS.has(key)) return;
      if (['borderWidth','fontSize','left','top',
        'paddingTop','paddingRight','paddingBottom','paddingLeft',
        'marginTop','marginRight','marginBottom','marginLeft'].includes(key)) {
        const min = ['left','top'].includes(key) ? -9999 : 0;
        node.style[key] = clamp(value, min, 99999) + 'px';
      } else if (key === 'borderRadius') {
        node.style[key] = normalizeRadius(value);
        const label = target.closest('.radius-row')?.querySelector('.radius-value');
        if (label) label.textContent = node.style[key];
      } else {
        node.style[key] = value;
      }
    } else if (path === 'name' || path === 'text') {
      node[path] = String(value).slice(0,10000);
    } else if (path === 'checked') {
      node.checked = !!value;
    } else if (node.type === 'slider' && ['value','min','max','step'].includes(path)) {
      node[path] = clamp(value, path === 'step' ? 1 : -10000, 10000);
      if (node.max <= node.min) node.max = node.min + 1;
      node.value = clamp(node.value,node.min,node.max);
    }
    renderCanvas(); renderTree();
    $('#selectedTitle').innerHTML = `${svg(node.type)}<span>${esc(node.name)}</span>`;
    saveLocal();
  }

  $('#addGrid').addEventListener('dragstart',e => {
    const tile = e.target.closest('[data-add]');
    if (tile) dragStart(e,{kind:'new',type:tile.dataset.add});
  });
  $('#templatesList').addEventListener('dragstart',e => {
    if (e.target.closest('[data-template-delete]')) { e.preventDefault(); return; }
    const item = e.target.closest('[data-template]');
    if (item) dragStart(e,{kind:'template',id:item.dataset.template});
  });
  $('#templatesList').addEventListener('click', e => {
    const del = e.target.closest('[data-template-delete]');
    if (del) {
      templates = templates.filter(t => t.id !== del.dataset.templateDelete);
      saveTemplates(); renderTemplates(); showToast('Шаблон удалён'); return;
    }
  });
  $('#tree').addEventListener('dragstart',e => {
    const row = e.target.closest('[data-tree]');
    if (!row || row.dataset.tree === project.root.id) { e.preventDefault(); return; }
    dragStart(e,{kind:'node',id:row.dataset.tree});
  });
  for (const [selector,area] of [['#tree','tree'],['#canvas','canvas']]) {
    $(selector).addEventListener('dragover',e => onDragOver(e,area));
    $(selector).addEventListener('drop',e => onDrop(e,area));
    $(selector).addEventListener('dragleave',e => {
      if (!e.currentTarget.contains(e.relatedTarget)) clearDropVisual();
    });
  }
  document.addEventListener('dragend',resetDrag);
  document.addEventListener('drop',resetDrag);
  $('#tree').addEventListener('click', e => {
    const expander = e.target.closest('[data-expand]');
    if (expander) {
      const id = expander.dataset.expand;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      renderTree(); return;
    }
    const row = e.target.closest('[data-tree]');
    if (row) setSelected(row.dataset.tree);
  });
  $('#canvas').addEventListener('click', e => {
    if (preview) return;
    const el = e.target.closest('[data-node-id]');
    if (el) { e.preventDefault(); e.stopPropagation(); setSelected(el.dataset.nodeId); }
  });
  $('#elementActions').addEventListener('click',e => {
    const button = e.target.closest('[data-action]');
    if (!button || button.disabled) return;
    switch (button.dataset.action) {
      case 'copy': copySelection(); break;
      case 'paste': pasteSelection(); break;
      case 'template': saveSelectionAsTemplate(); break;
      default: actOnSelection(button.dataset.action);
    }
  });
  $('#properties').addEventListener('click', e => {
    const summary = e.target.closest('details.prop-section > summary');
    if (!summary) return;
    const group = summary.parentElement.dataset.group;
    if (summary.parentElement.open) expandedGroups.delete(group); else expandedGroups.add(group);
  });
  $('#properties').addEventListener('focusin',e => {
    if (e.target.matches('[data-prop],[data-size-number],[data-size-unit],[data-bg-transparent]')) baselineOnFocus = JSON.stringify(project);
  });
  $('#properties').addEventListener('input',e => {
    if (!e.target.matches('[data-prop],[data-size-number],[data-size-unit],[data-bg-transparent]')) return;
    if (e.target.tagName === 'SELECT') return; // селекты обрабатываем при change
    if (baselineOnFocus === null) baselineOnFocus = JSON.stringify(project);
    updateProperty(e.target);
    if (e.target.type === 'color') {
      const hex = e.target.parentElement.querySelector('.color-value');
      if (hex) hex.textContent = e.target.value.toUpperCase();
    }
  });
  $('#properties').addEventListener('change',e => {
    if (!e.target.matches('[data-prop],[data-size-number],[data-size-unit],[data-bg-transparent]')) return;
    if (baselineOnFocus === null) baselineOnFocus = JSON.stringify(project);
    updateProperty(e.target);
    if (baselineOnFocus !== JSON.stringify(project)) pushUndo(baselineOnFocus);
    baselineOnFocus = null;
    renderProperties(); refreshTop();
  });
  $('#modeBtn').addEventListener('click', () => { preview = !preview; renderAll(); });
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#newBtn').addEventListener('click', () => {
    if (!confirm('Создать новый проект? Текущая страница будет заменена. Рекомендуем предварительно скачать JSON.')) return;
    pushUndo(); project = createDemo(); project.root.children = [];
    selectedId = project.root.id; collapsed.clear(); renderAll(); showToast('Пустой проект создан');
  });
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(project,null,2)],{type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'wb-panel-project.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    showToast('JSON-проект скачан');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change',async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024*1024) throw Error('Файл больше 1 МБ');
      const newProject = normalizeProject(JSON.parse(await file.text()));
      pushUndo(); project = newProject; selectedId = project.root.id; collapsed.clear();
      preview = false; renderAll(); showToast('Проект открыт');
    } catch(error) { alert('Не удалось открыть проект: ' + error.message); }
    e.target.value='';
  });
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey || e.altKey) return;
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key.toLowerCase() === 'c' && !preview) { e.preventDefault(); copySelection(); }
    else if (e.key.toLowerCase() === 'v' && !preview) { e.preventDefault(); pasteSelection(); }
  });
  const tip = $('#floatingTip');
  function showHelp(button) {
    if (!button) return;
    tip.textContent = button.dataset.help;
    tip.hidden = false;
    const rect = button.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    let top = rect.bottom + 9;
    if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 9);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideHelp() { tip.hidden = true; }
  $('#properties').addEventListener('pointerover', e => {
    const b = e.target.closest('[data-help]');
    if (b) showHelp(b);
  });
  $('#properties').addEventListener('pointerout', e => {
    const b = e.target.closest('[data-help]');
    if (b && !b.contains(e.relatedTarget)) hideHelp();
  });
  $('#properties').addEventListener('focusin', e => {
    const b = e.target.closest('[data-help]');
    if (b) showHelp(b);
  });
  $('#properties').addEventListener('focusout', e => {
    if (e.target.closest('[data-help]')) hideHelp();
  });
  $('#properties').addEventListener('click', e => {
    const b = e.target.closest('[data-help]');
    if (b) showHelp(b);
  });
  $('#properties').addEventListener('scroll', hideHelp);
  window.addEventListener('resize', hideHelp);
  renderIcons(); renderAll();
})();
