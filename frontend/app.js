/* WB Panel — приложение, история, перетаскивание и события интерфейса. */
(() => {
  'use strict';
  const {
    STORAGE_KEY, TEMPLATES_KEY, ALLOWED_TYPES, TYPE_NAMES,
    $, esc, svg, deepCopy, uid, clamp, createNode, createDemo,
    loadInitialProject, normalizeProject, loadTemplates,
    validateSnippet, nodeCount, nodeHeight, containsNode
  } = window.WBPanelModel;
  const API = window.WBPanelAPI;
  const SERVER_SESSION_KEY = 'webwb-current-server-project-v1';
  let project = loadInitialProject();
  let serverProjectId = null;
  let serverBaseline = null;
  let serverReady = false;
  let apiBusy = false;
  let projectList = [];
  try {
    const saved = JSON.parse(localStorage.getItem(SERVER_SESSION_KEY) || 'null');
    if (saved && /^[0-9a-f]{32}$/.test(saved.id) && typeof saved.baseline === 'string') {
      serverProjectId = saved.id;
      serverBaseline = saved.baseline;
    }
  } catch (_) { /* Нет сохранённой связи с серверным проектом. */ }
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

  function isDirty() {
    return serverProjectId === null || JSON.stringify(project) !== serverBaseline;
  }
  function updateSaveStatus() {
    const el = $('#saveStatus');
    if (serverProjectId && !isDirty()) el.textContent = 'Сохранено на сервере';
    else if (serverProjectId) el.textContent = 'Не сохранено на сервере · черновик в браузере';
    else el.textContent = 'Новый проект · черновик в браузере';
  }
  function storeServerSession() {
    try {
      if (serverProjectId) localStorage.setItem(SERVER_SESSION_KEY,
        JSON.stringify({id:serverProjectId, baseline:serverBaseline}));
      else localStorage.removeItem(SERVER_SESSION_KEY);
    } catch (_) { /* Сервер остаётся главным хранилищем, localStorage необязателен. */ }
  }
  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
    catch (_) { $('#saveStatus').textContent = 'Не удалось сохранить черновик в браузере'; return; }
    updateSaveStatus();
  }
  function updateProjectButtons() {
    const offline = !serverReady || apiBusy;
    $('#saveServerBtn').disabled = offline;
    $('#openServerBtn').disabled = offline || !$('#serverProjectSelect').value;
    $('#refreshProjectsBtn').disabled = apiBusy;
    $('#serverProjectSelect').disabled = offline;
    $('#newBtn').disabled = apiBusy;
    $('#importBtn').disabled = apiBusy;
    $('#serverStatus').textContent = apiBusy ? 'Сервер: выполняется запрос…'
      : serverReady ? 'Сервер: доступен' : 'Сервер: недоступен · открыт локальный черновик';
  }
  function populateProjectList(preferredId = null) {
    const picker = $('#serverProjectSelect');
    const chosen = preferredId || picker.value || serverProjectId;
    picker.replaceChildren(new Option('Выберите проект…', ''));
    for (const item of projectList) {
      if (typeof item.id !== 'string') continue;
      picker.add(new Option(String(item.title || 'Без названия'), item.id));
    }
    if (chosen && projectList.some(p => p.id === chosen)) picker.value = chosen;
    updateProjectButtons();
  }
  async function refreshProjectList() {
    if (location.protocol === 'file:') {
      serverReady = false; updateProjectButtons(); return;
    }
    try {
      projectList = await API.list();
      if (!Array.isArray(projectList)) throw new Error('Неправильный список проектов');
      serverReady = true;
      populateProjectList();
      try { await refreshTemplates(); }
      catch (error) { showToast('Не удалось загрузить шаблоны: ' + error.message); }
    } catch (error) {
      serverReady = false;
      projectList = [];
      populateProjectList();
      showToast('Сервер недоступен: ' + error.message);
    }
  }
  function confirmReplace() {
    return !isDirty() || confirm('Есть несохранённые на сервере изменения. Продолжить и заменить текущую страницу?');
  }
  function activateProject(nextProject, id = null) {
    project = nextProject;
    serverProjectId = id;
    serverBaseline = id ? JSON.stringify(project) : null;
    storeServerSession();
    undoStack = []; redoStack = []; baselineOnFocus = null;
    selectedId = project.root.id;
    collapsed.clear(); preview = false;
    renderAll();
  }
  async function saveToServer() {
    if (!serverReady || apiBusy) return;
    const snapshot = JSON.stringify(project);
    apiBusy = true; updateProjectButtons();
    try {
      if (serverProjectId) {
        await API.update(serverProjectId, JSON.parse(snapshot));
      } else {
        const result = await API.create(JSON.parse(snapshot));
        if (!result || !/^[0-9a-f]{32}$/.test(result.id)) throw new Error('Сервер не вернул ID проекта');
        serverProjectId = result.id;
      }
      serverBaseline = snapshot;
      storeServerSession();
      updateSaveStatus();
      showToast('Проект сохранён на сервере');
      try { projectList = await API.list(); populateProjectList(serverProjectId); }
      catch (_) { /* Сохранение уже прошло; сбой обновления списка не отменяет его. */ }
    } catch (error) {
      showToast('Ошибка сохранения: ' + error.message);
      alert('Не удалось сохранить проект на сервере: ' + error.message);
    } finally { apiBusy = false; updateProjectButtons(); }
  }
  async function openFromServer() {
    if (!serverReady || apiBusy) return;
    const id = $('#serverProjectSelect').value;
    if (!id || !confirmReplace()) return;
    apiBusy = true; updateProjectButtons();
    try {
      const saved = await API.load(id);
      activateProject(normalizeProject(saved), id);
      showToast('Проект загружен с сервера');
    } catch (error) {
      alert('Не удалось открыть проект с сервера: ' + error.message);
    } finally { apiBusy = false; updateProjectButtons(); }
  }
  // One-time migration of previously saved browser templates. An incomplete
  // migration is retried safely: existing server copies are compared first.
  async function refreshTemplates() {
    if (!serverReady) return;
    const existing = await API.listTemplates();
    if (!Array.isArray(existing)) throw new Error('Сервер вернул некорректные шаблоны');
    const legacy = loadTemplates();
    for (const item of legacy) {
      if (existing.some(t => t.name === item.name && JSON.stringify(t.node) === JSON.stringify(item.node))) continue;
      const result = await API.createTemplate({name:item.name, node:item.node});
      existing.push({id:result.id, name:item.name, node:item.node});
    }
    if (legacy.length) {
      try { localStorage.removeItem(TEMPLATES_KEY); } catch (_) { /* необязательно */ }
    }
    templates = await API.listTemplates();
    renderTemplates();
  }
  function ancestorDepth(id, node = project.root, depth = 0) {
    if (node.id === id) return depth;
    if (node.type !== 'container') return -1;
    for (const child of node.children) {
      const result = ancestorDepth(id, child, depth + 1);
      if (result !== -1) return result;
    }
    return -1;
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
  function refreshTop() {
    $('#projectTitle').textContent = project.title;
    if (document.activeElement !== $('#projectNameInput')) $('#projectNameInput').value = project.title;
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

  async function saveSelectionAsTemplate() {
    if (!serverReady) return showToast('Для сохранения шаблона требуется сервер');
    if (apiBusy) return;
    const info = locate(selectedId);
    if (!info) return;
    const title = prompt('Название шаблона', info.node.name || TYPE_NAMES[info.node.type]);
    if (title === null) return;
    const name = title.trim().slice(0,80);
    if (!name) return showToast('Введите название шаблона');
    try {
      const result = await API.createTemplate({name, node:deepCopy(info.node)});
      if (!result || !/^[0-9a-f]{32}$/.test(result.id)) throw new Error('Сервер не вернул ID шаблона');
      await refreshTemplates();
      showToast('Шаблон сохранён на сервере');
    } catch (error) {
      showToast('Ошибка сохранения шаблона: ' + error.message);
    }
  }

  async function deleteTemplate(id) {
    if (!serverReady) return showToast('Сервер недоступен');
    try {
      await API.deleteTemplate(id);
      templates = templates.filter(t => t.id !== id);
      renderTemplates();
      showToast('Шаблон удалён');
    } catch (error) {
      showToast('Ошибка удаления: ' + error.message);
    }
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


  // Передаём модулям ссылки на текущее состояние, не копируя проект:
  // при импорте, отмене или новом проекте объект project заменяется.
  const state = {
    get project() { return project; },
    get selectedId() { return selectedId; },
    get preview() { return preview; },
    get templates() { return templates; },
    get clipboardNode() { return clipboardNode; }
  };
  const ctx = { state, collapsed, locate, saveLocal, showToast };
  const view = window.WBPanelCreateView(ctx);
  Object.assign(ctx, view);
  const properties = window.WBPanelCreateProperties(ctx);
  Object.assign(ctx, properties);
  const { renderTemplates, renderIcons, renderTree, renderCanvas } = view;
  const { renderProperties, updateProperty, expandedGroups } = properties;
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
      deleteTemplate(del.dataset.templateDelete); return;
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
    if (!confirmReplace()) return;
    const blank = createDemo(); blank.root.children = []; blank.title = 'Новый проект';
    activateProject(blank);
    $('#serverProjectSelect').value = '';
    updateProjectButtons();
    showToast('Создан черновик. Нажмите «Сохранить», чтобы записать его на сервер.');
  });
  $('#projectNameInput').addEventListener('focus', () => { baselineOnFocus = JSON.stringify(project); });
  $('#projectNameInput').addEventListener('input', e => {
    project.title = e.target.value.slice(0, 100);
    $('#projectTitle').textContent = project.title;
    saveLocal();
  });
  $('#projectNameInput').addEventListener('change', () => {
    if (!project.title.trim()) project.title = 'Без названия';
    if (baselineOnFocus && baselineOnFocus !== JSON.stringify(project)) pushUndo(baselineOnFocus);
    baselineOnFocus = null; refreshTop(); saveLocal();
  });
  $('#projectNameInput').addEventListener('blur', () => {
    if (baselineOnFocus && baselineOnFocus !== JSON.stringify(project)) pushUndo(baselineOnFocus);
    baselineOnFocus = null; refreshTop(); saveLocal();
  });
  $('#projectNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('#refreshProjectsBtn').addEventListener('click', refreshProjectList);
  $('#openServerBtn').addEventListener('click', openFromServer);
  $('#saveServerBtn').addEventListener('click', saveToServer);
  $('#serverProjectSelect').addEventListener('change', updateProjectButtons);
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
      if (!confirmReplace()) return;
      activateProject(newProject); $('#serverProjectSelect').value = ''; updateProjectButtons();
      showToast('JSON открыт как новый черновик. Для сохранения нажмите «Сохранить».');
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
  populateProjectList();
  refreshProjectList();
})();
