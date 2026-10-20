/* WB Panel — модель JSON и общие утилиты. Автономный классический JS-файл. */
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
  function validateSnippet(node) {
    const root = createNode('container');
    root.children = [node];
    return normalizeProject({version:3, root}).root.children[0];
  }
  function nodeCount(node) { return 1 + (node.type === 'container' ? node.children.reduce((n,c) => n + nodeCount(c), 0) : 0); }
  function nodeHeight(node) { return node.type === 'container' ? 1 + Math.max(0,...node.children.map(nodeHeight)) : 1; }
  function containsNode(node,id) {
    return node.id === id || (node.type === 'container' && node.children.some(ch => containsNode(ch,id)));
  }

  window.WBPanelModel = Object.freeze({
    STORAGE_KEY, TEMPLATES_KEY, ALLOWED_TYPES, STYLE_KEYS, TYPE_NAMES,
    FULL_RADIUS, svg, $, esc, deepCopy, uid, clamp, normalizeRadius,
    createNode, createDemo, normalizeProject, loadInitialProject,
    loadTemplates, validateSnippet, nodeCount, nodeHeight, containsNode
  });
})();
