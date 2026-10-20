/* WB Panel — HTML полей свойств и обработка их изменений. */
(() => {
  'use strict';
  const { $, esc, svg, clamp, STYLE_KEYS, TYPE_NAMES, normalizeRadius, FULL_RADIUS } = window.WBPanelModel;
  window.WBPanelCreateProperties = (ctx) => {
    const state = ctx.state;
    const locate = ctx.locate;
    const saveLocal = ctx.saveLocal;
    const renderCanvas = () => ctx.renderCanvas();
    const renderTree = () => ctx.renderTree();
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
    sliderValue: 'Положение ползунка при открытии демонстрационного просмотра.',
    image: 'Картинка хранится на контроллере. Загрузите PNG, JPEG или WebP до 1 МиБ.',
    mqttTopic: 'Полный MQTT-топик состояния, например /devices/demo/controls/Temperature. Пустое поле отключает привязку.',
    mqttValue: 'Точное значение MQTT, при котором кнопка подсвечивается или переключатель включён. По умолчанию 1.',
    mqttAction: 'Топик, в который отправляется команда при действии пользователя в режиме просмотра. Обычно /devices/.../controls/.../on.',
    mqttActionValue: 'Значение, отправляемое при нажатии кнопки. По умолчанию 1.',
    mqttOn: 'Команда для включения переключателя. По умолчанию 1.',
    mqttOff: 'Команда для выключения переключателя. По умолчанию 0.'
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
  const expandedGroups = new Set(['Основное','Размеры','Контейнер','Текст','Кнопка','Переключатель','Ползунок','Изображение', 'MQTT · состояние','MQTT · действие']);
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
    const node = locate(state.selectedId).node;
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
    const info = locate(state.selectedId);
    if (!info) return;
    const {node,parent,index} = info;
    $('#selectedTitle').innerHTML = `${svg(node.type)}<span>${esc(node.name)}</span>`;
    const isRoot = !parent;
    const parentIsFree = !!parent && parent.style.display === 'block';
    $('#elementActions').querySelectorAll('[data-action]').forEach(b => {
      const a = b.dataset.action;
      b.disabled = (isRoot && ['up','down','duplicate','delete'].includes(a)) || (a === 'paste' && !state.clipboardNode) || (!isRoot && a === 'up' && index <= 0) || (!isRoot && a === 'down' && index === parent.children.length - 1);
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
      } else if (node.type === 'image') {
        specific += `<div class="field"><div class="field-heading"><span class="field-label">Файл изображения</span>${help('Изображение',TIPS.image)}</div><button type="button" class="toolbar-button" data-upload-image="1">Загрузить изображение</button><div class="field-note">${node.src ? 'Загружено на сервер' : 'Не выбрано'}</div></div>`;
      } else if (node.type === 'switch') {
        specific += field('Начальное состояние','checked',node.checked,{type:'checkbox',tip:TIPS.checked});
      } else if (node.type === 'slider') {
        specific += `<div class="field-row">${field('Минимум','min',node.min ?? 0,{type:'number',signed:true,tip:TIPS.sliderMin})}${field('Максимум','max',node.max ?? 100,{type:'number',signed:true,tip:TIPS.sliderMax})}</div>`;
        specific += `<div class="field-row">${field('Шаг','step',node.step ?? 1,{type:'number',tip:TIPS.sliderStep})}${field('Начальное значение','value',node.value ?? 50,{type:'number',signed:true,tip:TIPS.sliderValue})}</div>`;
      }
      html += section(TYPE_NAMES[node.type],specific);
    }
    if (['text','button','switch','slider'].includes(node.type)) {
      const mqtt = node.mqtt || {};
      let fields = field('Топик состояния', 'mqtt.statusTopic', mqtt.statusTopic || '', {tip:TIPS.mqttTopic});
      if (['button','switch'].includes(node.type))
        fields += field('Активное значение', 'mqtt.activeValue', mqtt.activeValue ?? '1', {tip:TIPS.mqttValue});
      html += section('MQTT · состояние', fields);
      if (node.type !== 'text') {
        let actions = field('Топик команды', 'mqtt.actionTopic', mqtt.actionTopic || '', {tip:TIPS.mqttAction});
        if (node.type === 'button')
          actions += field('Значение команды', 'mqtt.actionValue', mqtt.actionValue ?? '1', {tip:TIPS.mqttActionValue});
        if (node.type === 'switch') {
          actions += field('Значение ВКЛ', 'mqtt.onValue', mqtt.onValue ?? '1', {tip:TIPS.mqttOn});
          actions += field('Значение ВЫКЛ', 'mqtt.offValue', mqtt.offValue ?? '0', {tip:TIPS.mqttOff});
        }
        if (node.type === 'slider') actions += '<p class="field-note">Отправляется число при отпускании ползунка.</p>';
        html += section('MQTT · действие', actions);
      }
    }
    $('#properties').innerHTML = html;
  }

  function updateProperty(target) {
    const path = target.dataset.prop || target.dataset.sizeUnit || target.dataset.sizeNumber;
    if (!path && !target.dataset.bgTransparent) return;
    const info = locate(state.selectedId);
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
    } else if (path === 'mqtt.statusTopic' || path === 'mqtt.actionTopic') {
      const key = path.split('.')[1];
      const topic = String(value).trim();
      if (topic && (new TextEncoder().encode(topic).length > 256 || /[\u0000+#]/.test(topic))) {
        target.value = node.mqtt?.[key] || '';
        return;
      }
      const binding = {...node.mqtt};
      if (topic) binding[key] = topic;
      else delete binding[key];
      if (key === 'statusTopic') {
        if (topic && ['button','switch'].includes(node.type) && typeof binding.activeValue !== 'string')
          binding.activeValue = '1';
        if (!topic) delete binding.activeValue;
      } else {
        if (topic && node.type === 'button' && typeof binding.actionValue !== 'string') binding.actionValue = '1';
        if (topic && node.type === 'switch') {
          if (typeof binding.onValue !== 'string') binding.onValue = '1';
          if (typeof binding.offValue !== 'string') binding.offValue = '0';
        }
        if (!topic) { delete binding.actionValue; delete binding.onValue; delete binding.offValue; }
      }
      if (Object.keys(binding).length) node.mqtt = binding;
      else delete node.mqtt;
    } else if (['mqtt.activeValue','mqtt.actionValue','mqtt.onValue','mqtt.offValue'].includes(path)) {
      const key = path.split('.')[1];
      const requiresStatus = key === 'activeValue';
      if (node.mqtt?.[requiresStatus ? 'statusTopic' : 'actionTopic'])
        node.mqtt[key] = String(value).slice(0,120);
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

    return { renderProperties, updateProperty, expandedGroups };
  };
})();
