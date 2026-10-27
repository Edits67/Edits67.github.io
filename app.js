(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const canvas = $('#sim-canvas');
  const ctx = canvas.getContext('2d');
  const languageScreen = $('#language-screen');
  const languageError = $('#language-error');
  const app = $('#app');
  const objectSelect = $('#object-select');
  const powerSlider = $('#power-slider');
  const powerValue = $('#power-value');
  const stageFrame = $('#stage-frame');
  const forceListElement = $('#force-list');
  const toastElement = $('#toast');

  const BASE_SCALE = 44;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2.5;
  const MAX_OBJECTS = 12;
  const MAX_SPEED = 7.5;
  const OBJECT_COLORS = [
    { face: '#b9a9ff', edge: '#7258e8', light: '#e0d9ff', dark: '#8c76ee' },
    { face: '#a3e9cd', edge: '#2b9b70', light: '#d7f7e8', dark: '#62cda1' },
    { face: '#ffd0a9', edge: '#df8b4e', light: '#ffe8d5', dark: '#f2ac76' },
    { face: '#a9d7ff', edge: '#448fc9', light: '#d9edff', dark: '#75b6f0' },
    { face: '#ffb9c7', edge: '#d76284', light: '#ffdee6', dark: '#ef91a9' },
    { face: '#ffe49a', edge: '#c59726', light: '#fff3c9', dark: '#e9c354' }
  ];
  const FORCE_COLORS = ['#7659ed', '#ed7b68', '#299c79', '#4098e8', '#c18a24', '#c65b9a', '#626f8b', '#30a6af'];
  const PRESET_VECTORS = {
    N: { x: 0, y: -1, key: 'direction.north', arrow: '↑' },
    S: { x: 0, y: 1, key: 'direction.south', arrow: '↓' },
    E: { x: 1, y: 0, key: 'direction.east', arrow: '→' },
    W: { x: -1, y: 0, key: 'direction.west', arrow: '←' }
  };
  const COMPASS_8 = [
    { key: 'direction.east', arrow: '→' },
    { key: 'direction.northEast', arrow: '↗' },
    { key: 'direction.north', arrow: '↑' },
    { key: 'direction.northWest', arrow: '↖' },
    { key: 'direction.west', arrow: '←' },
    { key: 'direction.southWest', arrow: '↙' },
    { key: 'direction.south', arrow: '↓' },
    { key: 'direction.southEast', arrow: '↘' }
  ];

  let currentLanguage = null;
  let dictionary = {};
  let chooserDictionary = {};
  let activeTool = 'select';
  let selectedDirection = 'E';
  let selectedObjectId = 1;
  let paused = false;
  let nextObjectId = 2;
  let nextForceId = 1;
  let objects = [];
  let forces = [];
  let camera = { x: 0, y: 0, zoom: 1 };
  let canvasWidth = 0;
  let canvasHeight = 0;
  let pixelRatio = 1;
  let lastFrameTime = 0;
  let lastMetricsUpdate = 0;
  let toastTimeout = null;
  let interaction = null;
  let forcePreview = null;
  let lastPointerScreen = null;
  let languageLoadInProgress = false;
  const pointers = new Map();

  function t(key) {
    return dictionary[key] ?? key;
  }

  function applyTranslations(root = document) {
    $$('[data-i18n]', root).forEach((element) => {
      const value = t(element.dataset.i18n);
      if (value !== element.dataset.i18n) element.textContent = value;
    });
    $$('[data-i18n-title]', root).forEach((element) => {
      const value = t(element.dataset.i18nTitle);
      if (value !== element.dataset.i18nTitle) element.title = value;
    });
    $$('[data-i18n-aria]', root).forEach((element) => {
      const value = t(element.dataset.i18nAria);
      if (value !== element.dataset.i18nAria) element.setAttribute('aria-label', value);
    });
  }

  async function loadChooserStrings() {
    try {
      const response = await fetch('locales/chooser.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const chooserStrings = await response.json();
      chooserDictionary = chooserStrings;
      $$('[data-i18n]', languageScreen).forEach((element) => {
        const value = chooserStrings[element.dataset.i18n];
        if (typeof value === 'string') element.textContent = value;
      });
      $$('[data-i18n-aria]', languageScreen).forEach((element) => {
        const value = chooserStrings[element.dataset.i18nAria];
        if (typeof value === 'string') element.setAttribute('aria-label', value);
      });
    } catch (error) {
      // The bilingual HTML text remains as a helpful fallback if the page was opened incorrectly.
      console.warn('Could not load chooser language file:', error);
    }
  }

  function displayLanguageError() {
    languageError.textContent = chooserDictionary['chooser.loadError'] || 'Could not load the language files. Make sure the locales folder is published alongside index.html. / Dil dosyaları yüklenemedi. locales klasörünün index.html ile birlikte yayımlandığından emin olun.';
    languageError.hidden = false;
  }

  async function chooseLanguage(language) {
    if (languageLoadInProgress) return;
    languageLoadInProgress = true;
    languageError.hidden = true;
    try {
      const response = await fetch(`locales/${language}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const loadedDictionary = await response.json();
      if (!loadedDictionary || typeof loadedDictionary !== 'object') throw new Error('Invalid translation file');
      const previousLanguage = currentLanguage;
      dictionary = loadedDictionary;
      currentLanguage = language;
      document.documentElement.lang = language;
      document.title = `${t('site.title')} — ${t('site.subtitle')}`;
      applyTranslations(document);
      $$('.language-switch-button').forEach((button) => {
        button.classList.toggle('is-active', button.textContent.trim() === language.toUpperCase());
        button.setAttribute('aria-pressed', String(button.textContent.trim() === language.toUpperCase()));
      });
      languageScreen.classList.add('is-hidden');
      app.classList.remove('is-hidden');
      if (stageFrame) stageFrame.setAttribute('dir', 'ltr');
      updateAllUI();
      requestAnimationFrame(() => {
        resizeCanvas();
        renderScene();
      });
      if (previousLanguage && previousLanguage !== language) showToast(t('toast.languageChanged'));
    } catch (error) {
      console.error('Could not load language file:', error);
      displayLanguageError();
    } finally {
      languageLoadInProgress = false;
    }
  }

  function showLanguageChooser() {
    languageError.hidden = true;
    languageScreen.classList.remove('is-hidden');
  }

  function getObject(id) {
    return objects.find((object) => object.id === Number(id)) || null;
  }

  function objectName(object) {
    const index = objects.findIndex((candidate) => candidate.id === object.id) + 1;
    return `${t('objects.box')} ${Math.max(index, 1)}`;
  }

  function selectedObject() {
    return getObject(selectedObjectId) || objects[0] || null;
  }

  function objectColor(object) {
    return OBJECT_COLORS[(Math.max(1, object.id) - 1) % OBJECT_COLORS.length];
  }

  function resetWorld() {
    objects = [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 2 }];
    forces = [];
    selectedObjectId = 1;
    nextObjectId = 2;
    nextForceId = 1;
    camera = { x: 0, y: 0, zoom: 1 };
    paused = false;
    activeTool = 'select';
    selectedDirection = 'E';
    interaction = null;
    forcePreview = null;
    pointers.clear();
    updateAllUI();
    resizeCanvas();
    renderScene();
  }

  function updateAllUI() {
    updateToolButtons();
    updateDirectionButtons();
    updatePowerUI();
    updateObjectSelect();
    updateSelectedObjectChip();
    updatePauseUI();
    updateZoomUI();
    renderForceList();
    updateMetrics();
    updateCanvasCursor();
    updateStageTip();
  }

  function updateToolButtons() {
    $$('[data-tool]').forEach((button) => {
      const active = button.dataset.tool === activeTool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateDirectionButtons() {
    $$('.direction-button').forEach((button) => {
      const active = button.dataset.direction === selectedDirection;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updatePowerUI() {
    powerValue.textContent = powerSlider.value;
    const percent = ((Number(powerSlider.value) - 1) / 19) * 100;
    powerSlider.style.background = `linear-gradient(90deg, #8b75f5 ${percent}%, #ece9fb ${percent}%)`;
  }

  function updateObjectSelect() {
    const previousValue = selectedObjectId;
    objectSelect.replaceChildren();
    objects.forEach((object) => {
      const option = document.createElement('option');
      option.value = String(object.id);
      option.textContent = objectName(object);
      objectSelect.append(option);
    });
    if (!getObject(previousValue) && objects.length) selectedObjectId = objects[0].id;
    objectSelect.value = String(selectedObjectId);
  }

  function updateSelectedObjectChip() {
    const object = selectedObject();
    const label = object ? `${objectName(object)} · ${t('objects.selected')}` : t('objects.box');
    $('#selected-object-chip-text').textContent = label;
    const chip = $('#selected-object-chip');
    if (chip) chip.title = object ? `${objectName(object)} — ${t('objects.mass')}: ${t('objects.massValue')}` : '';
  }

  function updatePauseUI() {
    const statusText = $('#simulation-status-text');
    const pauseText = $('#pause-button-text');
    const statusDot = $('#status-dot');
    statusText.textContent = paused ? t('status.paused') : t('status.running');
    pauseText.textContent = paused ? t('status.resume') : t('status.pause');
    statusDot.classList.toggle('is-paused', paused);
    $('#pause-icon').innerHTML = paused ? '<path d="m8 5 11 7-11 7V5Z" />' : '<path d="M8 5v14M16 5v14" />';
    $('#pause-btn').setAttribute('aria-pressed', String(paused));
  }

  function updateZoomUI() {
    $('#zoom-label').textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  function updateCanvasCursor() {
    canvas.classList.toggle('cursor-pan', activeTool === 'pan');
    canvas.classList.toggle('cursor-force', activeTool === 'force');
    canvas.classList.toggle('cursor-panning', Boolean(interaction && (interaction.kind === 'pan' || interaction.kind === 'pinch')));
    if (!interaction && activeTool === 'select') canvas.style.cursor = 'default';
  }

  function updateStageTip() {
    const key = activeTool === 'force' ? 'stage.tipForce' : activeTool === 'pan' ? 'stage.tipPan' : 'stage.tipSelect';
    $('#stage-tip-text').textContent = t(key);
  }

  function updateMetrics() {
    const object = selectedObject();
    const relatedForces = object ? forces.filter((force) => force.bodyId === object.id) : [];
    let fx = 0;
    let fy = 0;
    relatedForces.forEach((force) => { fx += force.fx; fy += force.fy; });
    const net = Math.hypot(fx, fy);
    $('#net-force-value').textContent = net.toFixed(1);
    $('#net-force-direction').textContent = net < 0.05 ? t('direction.none') : directionNameFromVector(fx, fy);
    const speed = object ? Math.hypot(object.vx, object.vy) : 0;
    $('#speed-value').textContent = speed.toFixed(1);
    $('#force-count').textContent = String(relatedForces.length);
  }

  function directionNameFromVector(fx, fy) {
    const angle = Math.atan2(-fy, fx) * 180 / Math.PI;
    const normalized = (angle + 360) % 360;
    const sector = Math.round(normalized / 45) % 8;
    return t(COMPASS_8[sector].key);
  }

  function arrowSymbolFromVector(fx, fy) {
    const angle = Math.atan2(-fy, fx) * 180 / Math.PI;
    const normalized = (angle + 360) % 360;
    const sector = Math.round(normalized / 45) % 8;
    return COMPASS_8[sector].arrow;
  }

  function forceDisplayDirection(force) {
    if (force.preset && PRESET_VECTORS[force.preset]) return t(PRESET_VECTORS[force.preset].key);
    const angle = Math.round((Math.atan2(-force.fy, force.fx) * 180 / Math.PI + 360) % 360);
    return `${t('direction.custom')} · ${angle}°`;
  }

  function renderForceList() {
    const object = selectedObject();
    const selectedForces = object ? forces.filter((force) => force.bodyId === object.id) : [];
    forceListElement.replaceChildren();
    if (!selectedForces.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-forces';
      empty.textContent = t('results.noForces');
      forceListElement.append(empty);
      return;
    }

    selectedForces.forEach((force) => {
      const row = document.createElement('div');
      row.className = 'force-row';
      const icon = document.createElement('span');
      icon.className = 'force-arrow-icon';
      icon.textContent = arrowSymbolFromVector(force.fx, force.fy);
      icon.style.color = force.color;
      icon.style.background = `${force.color}18`;
      icon.setAttribute('aria-hidden', 'true');

      const textWrap = document.createElement('div');
      textWrap.className = 'force-row-text';
      const mainText = document.createElement('strong');
      mainText.textContent = `${force.magnitude} ${t('force.newtons')} · ${forceDisplayDirection(force)}`;
      const subText = document.createElement('small');
      subText.textContent = `${t('results.forceOn')}: ${object ? objectName(object) : t('objects.box')}`;
      textWrap.append(mainText, subText);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'force-remove-button';
      removeButton.textContent = '×';
      removeButton.title = t('force.remove');
      removeButton.setAttribute('aria-label', `${t('force.remove')} ${force.magnitude} ${t('force.newtons')}`);
      removeButton.addEventListener('click', () => {
        forces = forces.filter((candidate) => candidate.id !== force.id);
        renderForceList();
        updateMetrics();
        renderScene();
        showToast(t('toast.forceRemoved'));
      });

      row.append(icon, textWrap, removeButton);
      forceListElement.append(row);
    });
  }

  function showToast(message) {
    toastElement.textContent = message;
    toastElement.classList.add('is-visible');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastElement.classList.remove('is-visible'), 2300);
  }

  function createForce(bodyId, magnitude, directionX, directionY, preset = null) {
    const length = Math.hypot(directionX, directionY);
    if (!Number.isFinite(length) || length < 0.0001) return false;
    const force = {
      id: nextForceId++,
      bodyId,
      magnitude,
      fx: directionX / length * magnitude,
      fy: directionY / length * magnitude,
      preset,
      color: FORCE_COLORS[(nextForceId - 2) % FORCE_COLORS.length]
    };
    forces.push(force);
    updateSelectedObjectChip();
    renderForceList();
    updateMetrics();
    renderScene();
    showToast(t('toast.forceAdded'));
    return true;
  }

  function applyPresetForce() {
    const object = selectedObject();
    if (!object) return;
    const preset = PRESET_VECTORS[selectedDirection];
    const magnitude = Number(powerSlider.value);
    createForce(object.id, magnitude, preset.x, preset.y, selectedDirection);
  }

  function applyDrawnForce(targetWorld) {
    const object = selectedObject();
    if (!object) return;
    const dx = targetWorld.x - object.x;
    const dy = targetWorld.y - object.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.18) {
      const preset = PRESET_VECTORS[selectedDirection];
      createForce(object.id, Number(powerSlider.value), preset.x, preset.y, selectedDirection);
      return;
    }
    createForce(object.id, Number(powerSlider.value), dx, dy, null);
  }

  function addObject() {
    if (objects.length >= MAX_OBJECTS) {
      showToast(t('objects.limitReached'));
      return;
    }
    const id = nextObjectId++;
    const x = camera.x + ((objects.length % 3) - 1) * 1.65;
    const y = camera.y + (Math.floor(objects.length / 3) % 3 - 1) * 1.45;
    objects.push({ id, x, y, vx: 0, vy: 0, mass: 2 });
    selectedObjectId = id;
    updateObjectSelect();
    updateSelectedObjectChip();
    renderForceList();
    updateMetrics();
    renderScene();
    showToast(t('toast.objectAdded'));
  }

  function clearForces() {
    if (forces.length === 0) {
      renderForceList();
      return;
    }
    forces = [];
    renderForceList();
    updateMetrics();
    renderScene();
    showToast(t('toast.forcesCleared'));
  }

  function resetExperiment() {
    resetWorld();
    showToast(t('toast.experimentReset'));
  }

  function setActiveTool(tool) {
    if (!['select', 'force', 'pan'].includes(tool)) return;
    activeTool = tool;
    interaction = null;
    forcePreview = null;
    updateToolButtons();
    updateStageTip();
    updateCanvasCursor();
    renderScene();
  }

  function setPaused(value) {
    paused = Boolean(value);
    lastFrameTime = performance.now();
    updatePauseUI();
  }

  function togglePause() {
    setPaused(!paused);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    canvas.width = Math.round(canvasWidth * pixelRatio);
    canvas.height = Math.round(canvasHeight * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    renderScene();
  }

  function scale() {
    return BASE_SCALE * camera.zoom;
  }

  function worldToScreen(worldX, worldY) {
    const unit = scale();
    return {
      x: (worldX - camera.x) * unit + canvasWidth / 2,
      y: (worldY - camera.y) * unit + canvasHeight / 2
    };
  }

  function screenToWorld(screenX, screenY) {
    const unit = scale();
    return {
      x: (screenX - canvasWidth / 2) / unit + camera.x,
      y: (screenY - canvasHeight / 2) / unit + camera.y
    };
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clampZoom(value) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function zoomAt(screenX, screenY, newZoom) {
    const anchor = screenToWorld(screenX, screenY);
    camera.zoom = clampZoom(newZoom);
    const unit = scale();
    camera.x = anchor.x - (screenX - canvasWidth / 2) / unit;
    camera.y = anchor.y - (screenY - canvasHeight / 2) / unit;
    updateZoomUI();
    renderScene();
  }

  function hitTestObject(screenX, screenY) {
    for (let index = objects.length - 1; index >= 0; index--) {
      const object = objects[index];
      const point = worldToScreen(object.x, object.y);
      const w = Math.max(32, 1.38 * scale());
      const h = Math.max(26, 1.1 * scale());
      if (screenX >= point.x - w / 2 - 5 && screenX <= point.x + w / 2 + 5 && screenY >= point.y - h / 2 - 5 && screenY <= point.y + h / 2 + 5) return object;
    }
    return null;
  }

  function updateCoordinateReadout(screenX, screenY) {
    if (screenX == null || screenY == null || canvasWidth === 0) return;
    const world = screenToWorld(screenX, screenY);
    $('#coordinate-readout').textContent = `x: ${world.x.toFixed(1)} m · y: ${(-world.y).toFixed(1)} m`;
  }

  function beginPinch() {
    const points = [...pointers.values()];
    if (points.length < 2) return;
    const a = points[0];
    const b = points[1];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    interaction = {
      kind: 'pinch',
      initialDistance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      initialZoom: camera.zoom,
      anchor: screenToWorld(midX, midY)
    };
    forcePreview = null;
    updateCanvasCursor();
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    const point = pointerPosition(event);
    pointers.set(event.pointerId, point);
    lastPointerScreen = point;
    updateCoordinateReadout(point.x, point.y);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Pointer capture may be unavailable. */ }

    if (pointers.size >= 2) {
      beginPinch();
      return;
    }

    if (activeTool === 'force') {
      interaction = { kind: 'force', pointerId: event.pointerId };
      forcePreview = { x: point.x, y: point.y };
      renderScene();
      return;
    }

    const wantsPan = activeTool === 'pan' || event.button === 1 || event.shiftKey;
    if (wantsPan) {
      interaction = { kind: 'pan', pointerId: event.pointerId, lastX: point.x, lastY: point.y };
      updateCanvasCursor();
      return;
    }

    const hit = hitTestObject(point.x, point.y);
    if (hit) {
      selectedObjectId = hit.id;
      const world = screenToWorld(point.x, point.y);
      hit.vx = 0;
      hit.vy = 0;
      interaction = { kind: 'drag-object', pointerId: event.pointerId, objectId: hit.id, offsetX: hit.x - world.x, offsetY: hit.y - world.y };
      updateObjectSelect();
      updateSelectedObjectChip();
      renderForceList();
      updateMetrics();
      renderScene();
    } else {
      interaction = { kind: 'pan', pointerId: event.pointerId, lastX: point.x, lastY: point.y };
      updateCanvasCursor();
    }
  }

  function onPointerMove(event) {
    const point = pointerPosition(event);
    lastPointerScreen = point;
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
    updateCoordinateReadout(point.x, point.y);

    if (pointers.size >= 2 && interaction && interaction.kind === 'pinch') {
      const points = [...pointers.values()];
      const a = points[0];
      const b = points[1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      camera.zoom = clampZoom(interaction.initialZoom * distance / interaction.initialDistance);
      const unit = scale();
      camera.x = interaction.anchor.x - (midX - canvasWidth / 2) / unit;
      camera.y = interaction.anchor.y - (midY - canvasHeight / 2) / unit;
      updateZoomUI();
      renderScene();
      return;
    }

    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === 'pan') {
      const dx = point.x - interaction.lastX;
      const dy = point.y - interaction.lastY;
      camera.x -= dx / scale();
      camera.y -= dy / scale();
      interaction.lastX = point.x;
      interaction.lastY = point.y;
      updateZoomUI();
      renderScene();
    } else if (interaction.kind === 'drag-object') {
      const object = getObject(interaction.objectId);
      if (!object) return;
      const world = screenToWorld(point.x, point.y);
      object.x = world.x + interaction.offsetX;
      object.y = world.y + interaction.offsetY;
      object.vx = 0;
      object.vy = 0;
      updateMetrics();
      renderScene();
    } else if (interaction.kind === 'force') {
      forcePreview = { x: point.x, y: point.y };
      renderScene();
    }
    updateCanvasCursor();
  }

  function onPointerUp(event, cancelled = false) {
    const point = pointerPosition(event);
    const endedInteraction = interaction;
    const wasForceDrag = endedInteraction && endedInteraction.kind === 'force' && endedInteraction.pointerId === event.pointerId;
    if (wasForceDrag && !cancelled && pointers.size <= 1) {
      applyDrawnForce(screenToWorld(point.x, point.y));
    }
    pointers.delete(event.pointerId);
    if (endedInteraction && endedInteraction.pointerId === event.pointerId) interaction = null;
    if (interaction && interaction.kind === 'pinch') {
      const remaining = [...pointers.values()][0];
      if (remaining) interaction = { kind: 'pan', pointerId: [...pointers.keys()][0], lastX: remaining.x, lastY: remaining.y };
      else interaction = null;
    }
    if (pointers.size === 0) {
      forcePreview = null;
      if (activeTool === 'pan' || endedInteraction?.kind === 'pan') updateCanvasCursor();
    }
    updateCanvasCursor();
    renderScene();
    try { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch (_) { /* Ignore browser-specific pointer capture errors. */ }
  }

  function onWheel(event) {
    event.preventDefault();
    const point = pointerPosition(event);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(point.x, point.y, camera.zoom * factor);
    lastPointerScreen = point;
    updateCoordinateReadout(point.x, point.y);
  }

  function updatePhysics(dt) {
    if (dt <= 0) return;
    objects.forEach((object) => {
      let fx = 0;
      let fy = 0;
      forces.forEach((force) => {
        if (force.bodyId === object.id) {
          fx += force.fx;
          fy += force.fy;
        }
      });
      object.vx += fx / object.mass * dt;
      object.vy += fy / object.mass * dt;
      const speed = Math.hypot(object.vx, object.vy);
      if (speed > MAX_SPEED) {
        object.vx = object.vx / speed * MAX_SPEED;
        object.vy = object.vy / speed * MAX_SPEED;
      }
      object.x += object.vx * dt;
      object.y += object.vy * dt;
    });
  }

  function drawGrid() {
    ctx.fillStyle = '#fbfcff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const unit = scale();
    const leftWorld = camera.x - canvasWidth / 2 / unit;
    const rightWorld = camera.x + canvasWidth / 2 / unit;
    const topWorld = camera.y - canvasHeight / 2 / unit;
    const bottomWorld = camera.y + canvasHeight / 2 / unit;
    const minX = Math.floor(leftWorld) - 1;
    const maxX = Math.ceil(rightWorld) + 1;
    const minY = Math.floor(topWorld) - 1;
    const maxY = Math.ceil(bottomWorld) + 1;

    ctx.lineWidth = 1;
    for (let worldX = minX; worldX <= maxX; worldX++) {
      const x = worldToScreen(worldX, 0).x;
      const major = worldX % 5 === 0;
      ctx.strokeStyle = major ? '#e4e8f3' : '#eef1f7';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, canvasHeight);
      ctx.stroke();
      if (major && unit > 25 && worldX !== 0) {
        ctx.fillStyle = '#aeb7c9';
        ctx.font = '10px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(worldX), x, Math.max(4, canvasHeight - 28));
      }
    }
    for (let worldY = minY; worldY <= maxY; worldY++) {
      const y = worldToScreen(0, worldY).y;
      const major = worldY % 5 === 0;
      ctx.strokeStyle = major ? '#e4e8f3' : '#eef1f7';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(canvasWidth, Math.round(y) + 0.5);
      ctx.stroke();
      if (major && unit > 25 && worldY !== 0) {
        ctx.fillStyle = '#aeb7c9';
        ctx.font = '10px "DM Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(-worldY), 7, y);
      }
    }

    // Coordinate axes mark the world origin, not the center of the screen.
    const origin = worldToScreen(0, 0);
    if (origin.x >= 0 && origin.x <= canvasWidth) {
      ctx.strokeStyle = 'rgba(116, 89, 242, .17)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, canvasHeight);
      ctx.stroke();
    }
    if (origin.y >= 0 && origin.y <= canvasHeight) {
      ctx.strokeStyle = 'rgba(116, 89, 242, .17)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(canvasWidth, origin.y);
      ctx.stroke();
    }
    if (origin.x > 0 && origin.x < canvasWidth && origin.y > 0 && origin.y < canvasHeight) {
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#8d7bf1';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(141,123,241,.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawObject(object) {
    const point = worldToScreen(object.x, object.y);
    const unit = scale();
    const width = Math.max(32, 1.38 * unit);
    const height = Math.max(26, 1.1 * unit);
    const colors = objectColor(object);
    const selected = object.id === selectedObjectId;

    // Soft floor shadow.
    ctx.save();
    ctx.fillStyle = 'rgba(35, 46, 83, .10)';
    ctx.beginPath();
    ctx.ellipse(point.x + 1, point.y + height * .48, width * .47, height * .22, 0, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(116, 89, 242, .68)';
      roundedRectPath(point.x - width / 2 - 7, point.y - height / 2 - 7, width + 14, height + 14, 12);
      ctx.stroke();
      ctx.restore();
    }

    const gradient = ctx.createLinearGradient(point.x - width / 2, point.y - height / 2, point.x + width / 2, point.y + height / 2);
    gradient.addColorStop(0, colors.light);
    gradient.addColorStop(1, colors.face);
    roundedRectPath(point.x - width / 2, point.y - height / 2, width, height, Math.max(7, unit * .17));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1.4;
    ctx.strokeStyle = colors.edge;
    ctx.stroke();

    // A simple crate-like pattern makes the object easy to recognize on touch screens.
    ctx.strokeStyle = colors.dark;
    ctx.globalAlpha = .45;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(point.x - width * .28, point.y - height * .31);
    ctx.lineTo(point.x + width * .28, point.y + height * .31);
    ctx.moveTo(point.x + width * .28, point.y - height * .31);
    ctx.lineTo(point.x - width * .28, point.y + height * .31);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(3, unit * .075), 0, Math.PI * 2);
    ctx.fillStyle = colors.edge;
    ctx.fill();

    const name = objectName(object);
    ctx.font = `600 ${Math.max(10, Math.min(12, unit * .25))}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#4f5a75';
    ctx.fillText(name, point.x, point.y + height / 2 + 10);
    ctx.font = `${Math.max(9, Math.min(10, unit * .22))}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#a0a8ba';
    ctx.fillText(t('objects.massValue'), point.x, point.y + height / 2 + 24);
    ctx.restore();
  }

  function drawArrowLine(fromX, fromY, toX, toY, color, width = 3, dashed = false) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;
    const ux = dx / length;
    const uy = dy / length;
    const headLength = Math.max(8, Math.min(13, length * .27));
    const headWidth = headLength * .72;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX - ux * headLength * .65, toY - uy * headLength * .65);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle) + headWidth * Math.sin(angle), toY - headLength * Math.sin(angle) - headWidth * Math.cos(angle));
    ctx.lineTo(toX - headLength * Math.cos(angle) - headWidth * Math.sin(angle), toY - headLength * Math.sin(angle) + headWidth * Math.cos(angle));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawForceArrow(force, index, siblingCount) {
    const object = getObject(force.bodyId);
    if (!object) return;
    const center = worldToScreen(object.x, object.y);
    const vectorLength = Math.hypot(force.fx, force.fy);
    if (vectorLength < 0.001) return;
    const ux = force.fx / vectorLength;
    const uy = force.fy / vectorLength;
    const px = -uy;
    const py = ux;
    const unit = scale();
    const bodyWidth = Math.max(32, 1.38 * unit);
    const bodyHeight = Math.max(26, 1.1 * unit);
    const edgeX = Math.min((bodyWidth / 2) / Math.max(Math.abs(ux), .0001), (bodyHeight / 2) / Math.max(Math.abs(uy), .0001));
    const baseOffset = (index - (siblingCount - 1) / 2) * 5;
    const startX = center.x + ux * edgeX + px * baseOffset;
    const startY = center.y + uy * edgeX + py * baseOffset;
    const length = Math.min(255, (16 + force.magnitude * 7.5) * camera.zoom);
    const endX = startX + ux * length;
    const endY = startY + uy * length;
    drawArrowLine(startX, startY, endX, endY, force.color, 2.8, false);

    const label = `${force.magnitude} ${t('force.newtons')}`;
    ctx.save();
    ctx.font = '700 10px "DM Sans", sans-serif';
    const labelWidth = ctx.measureText(label).width + 14;
    const labelHeight = 21;
    let labelX = endX + px * 10;
    let labelY = endY + py * 10 - labelHeight / 2;
    labelX = Math.max(4, Math.min(canvasWidth - labelWidth - 4, labelX - labelWidth / 2));
    labelY = Math.max(4, Math.min(canvasHeight - labelHeight - 4, labelY));
    roundedRectPath(labelX, labelY, labelWidth, labelHeight, 6);
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.fill();
    ctx.strokeStyle = `${force.color}55`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = force.color;
    ctx.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2 + .5);
    ctx.restore();
  }

  function drawForceVectors() {
    const visibleForces = forces.filter((force) => getObject(force.bodyId));
    const byObject = new Map();
    visibleForces.forEach((force) => {
      if (!byObject.has(force.bodyId)) byObject.set(force.bodyId, []);
      byObject.get(force.bodyId).push(force);
    });
    byObject.forEach((list) => list.forEach((force, index) => drawForceArrow(force, index, list.length)));
  }

  function drawForcePreview() {
    if (!interaction || interaction.kind !== 'force' || !forcePreview) return;
    const object = selectedObject();
    if (!object) return;
    const center = worldToScreen(object.x, object.y);
    const target = forcePreview;
    const distance = Math.hypot(target.x - center.x, target.y - center.y);
    if (distance < 5) return;
    const color = '#8e7af3';
    drawArrowLine(center.x, center.y, target.x, target.y, color, 2.5, true);
    ctx.save();
    ctx.font = '700 10px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `${powerSlider.value} ${t('force.newtons')}`;
    const width = ctx.measureText(label).width + 14;
    const x = Math.max(4, Math.min(canvasWidth - width - 4, target.x - width / 2));
    const y = Math.max(4, Math.min(canvasHeight - 25, target.y - 28));
    roundedRectPath(x, y, width, 21, 6);
    ctx.fillStyle = 'rgba(244,241,255,.97)';
    ctx.fill();
    ctx.strokeStyle = '#d8d0ff';
    ctx.stroke();
    ctx.fillStyle = '#7058e5';
    ctx.fillText(label, x + width / 2, y + 10.5);
    ctx.restore();
  }

  function drawVelocityIndicator(object) {
    const speed = Math.hypot(object.vx, object.vy);
    if (speed < .06 || object.id !== selectedObjectId) return;
    const center = worldToScreen(object.x, object.y);
    const ux = object.vx / speed;
    const uy = object.vy / speed;
    const bodyWidth = Math.max(32, 1.38 * scale());
    const bodyHeight = Math.max(26, 1.1 * scale());
    const edge = Math.min((bodyWidth / 2) / Math.max(Math.abs(ux), .0001), (bodyHeight / 2) / Math.max(Math.abs(uy), .0001));
    const length = Math.min(80, 24 + speed * 5) * camera.zoom;
    drawArrowLine(center.x + ux * edge, center.y + uy * edge, center.x + ux * (edge + length), center.y + uy * (edge + length), '#238e65', 2.4, true);
  }

  function renderScene() {
    if (!ctx || canvasWidth < 1 || canvasHeight < 1) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawGrid();
    objects.forEach(drawObject);
    drawForceVectors();
    objects.forEach(drawVelocityIndicator);
    drawForcePreview();
    if (lastPointerScreen) updateCoordinateReadout(lastPointerScreen.x, lastPointerScreen.y);
  }

  function animationLoop(now) {
    if (!lastFrameTime) lastFrameTime = now;
    const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.04);
    lastFrameTime = now;
    if (!paused && !app.classList.contains('is-hidden')) {
      updatePhysics(dt);
      renderScene();
      if (now - lastMetricsUpdate > 100) {
        updateMetrics();
        lastMetricsUpdate = now;
      }
    }
    requestAnimationFrame(animationLoop);
  }

  function initializeEvents() {
    $$('.language-option').forEach((button) => button.addEventListener('click', () => chooseLanguage(button.dataset.language)));
    $$('[data-set-language]').forEach((button) => button.addEventListener('click', () => {
      const language = button.dataset.setLanguage;
      if (language !== currentLanguage) chooseLanguage(language);
    }));
    $('#choose-language-btn').addEventListener('click', showLanguageChooser);
    $$('[data-tool]').forEach((button) => button.addEventListener('click', () => setActiveTool(button.dataset.tool)));
    $$('.direction-button').forEach((button) => button.addEventListener('click', () => {
      selectedDirection = button.dataset.direction;
      updateDirectionButtons();
    }));
    powerSlider.addEventListener('input', updatePowerUI);
    $('#apply-force-btn').addEventListener('click', applyPresetForce);
    $('#clear-forces-btn').addEventListener('click', clearForces);
    $('#add-object-btn').addEventListener('click', addObject);
    $('#pause-btn').addEventListener('click', togglePause);
    $('#reset-experiment-btn').addEventListener('click', resetExperiment);
    $('#zoom-in-btn').addEventListener('click', () => zoomAt(canvasWidth / 2, canvasHeight / 2, camera.zoom * 1.15));
    $('#zoom-out-btn').addEventListener('click', () => zoomAt(canvasWidth / 2, canvasHeight / 2, camera.zoom / 1.15));
    $('#reset-camera-btn').addEventListener('click', () => {
      const object = selectedObject();
      camera = { x: object ? object.x : 0, y: object ? object.y : 0, zoom: 1 };
      updateZoomUI();
      resizeCanvas();
      showToast(t('toast.cameraReset'));
    });
    $('#fullscreen-btn').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else showToast(t('toast.fullscreenUnavailable'));
      } catch (error) {
        console.warn('Fullscreen could not be toggled:', error);
        showToast(t('toast.fullscreenUnavailable'));
      }
    });
    objectSelect.addEventListener('change', () => {
      selectedObjectId = Number(objectSelect.value);
      updateSelectedObjectChip();
      renderForceList();
      updateMetrics();
      renderScene();
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', (event) => onPointerUp(event, false));
    canvas.addEventListener('pointercancel', (event) => onPointerUp(event, true));
    canvas.addEventListener('lostpointercapture', (event) => {
      if (pointers.has(event.pointerId)) onPointerUp(event, true);
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    window.addEventListener('resize', resizeCanvas, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(() => resizeCanvas()).observe(stageFrame);

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target && (target.matches('input, select, textarea') || target.isContentEditable);
      if (event.code === 'Space' && !typing && target?.tagName !== 'BUTTON') {
        event.preventDefault();
        if (!event.repeat) {
          togglePause();
        }
      }
      if (event.key === 'Escape' && !languageScreen.classList.contains('is-hidden') && currentLanguage) {
        languageScreen.classList.add('is-hidden');
      }
    });
  }

  async function init() {
    resetWorld();
    initializeEvents();
    await loadChooserStrings();
    updateAllUI();
    requestAnimationFrame(animationLoop);
  }

  init();
})();
