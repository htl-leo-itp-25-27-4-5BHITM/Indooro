import { createHistory, escapeHtml, pushHistory, redoHistory, undoHistory, validateLayoutDocument } from './editor-core.js';

/* ----- Data (aus React übernommen) ----- */
let PRODUCT_CATEGORIES = []; // Will be loaded from JSON

const ELEMENT_TYPES = [
  { id: 'shelf', name: 'Regal', icon: '▭' },
  { id: 'counter', name: 'Theke', icon: '▬' },
  { id: 'cooler', name: 'Kühlregal', icon: '❄' },
  { id: 'freezer', name: 'Tiefkühlregal', icon: '🧊' },
  { id: 'entrance', name: 'Eingang', icon: '🚪' },
  { id: 'checkout', name: 'Kasse', icon: '💳' },
  { id: 'beacon', name: 'Beacon', icon: '📡' },
];

const TEMPLATES = [
  { id: 'small', name: 'Kleiner Laden (15x20m)', width: 15, height: 20 },
  { id: 'medium', name: 'Mittlerer Laden (40x60m)', width: 40, height: 60 },
  { id: 'large', name: 'Großer Laden (60x80m)', width: 60, height: 80 },
];

/* ----- State (Vanilla) ----- */
let elements = [];
let selectedElement = null;
let isDrawing = false;
let drawStart = null;
let isDragging = false;
let dragMoved = false;
let dragOffset = { x: 0, y: 0 };

let currentTool = 'select';
let currentCategory = null; // No default category
let currentElementType = ELEMENT_TYPES[0];
let gridSize = { width: 40, height: 60 };
let showGrid = true;
let zoom = 1;
let shopName = 'Mein Supermarkt';
let isRotating = false;
let showRotationUI = false;
const LEGACY_LAYOUT_API = '/api/layout/current';
const urlParams = new URLSearchParams(window.location.search);
const storeId = urlParams.get('storeId');
let storeContext = null;
let assignedBeacons = [];
let editorLayoutId = null;

const cellSize = 20; // pixels per meter cell

/* ----- Undo/Redo System ----- */
let history = null;
let pendingHistoryTimer = null;

function captureState() {
  return {
    elements: JSON.parse(JSON.stringify(elements)),
    gridSize: { ...gridSize },
    shopName: shopNameInput.value
  };
}

function restoreState(snapshot) {
  elements = JSON.parse(JSON.stringify(snapshot.elements));
  gridSize = { ...snapshot.gridSize };
  shopName = snapshot.shopName;
  shopNameInput.value = snapshot.shopName;
  gridWidthInput.value = gridSize.width;
  gridHeightInput.value = gridSize.height;
  selectedElement = null;
  renderCanvas();
  renderProperties();
}

function saveState() {
  const snapshot = captureState();
  history = history ? pushHistory(history, snapshot) : createHistory(snapshot);
}

function queueHistorySave() {
  clearTimeout(pendingHistoryTimer);
  pendingHistoryTimer = setTimeout(() => {
    pendingHistoryTimer = null;
    saveState();
  }, 500);
}

function flushHistorySave() {
  if (pendingHistoryTimer == null) return;
  clearTimeout(pendingHistoryTimer);
  pendingHistoryTimer = null;
  saveState();
}

window.addEventListener('pointerdown', flushHistorySave, { capture: true });

function undo() {
  flushHistorySave();
  if (!history) return;
  const next = undoHistory(history);
  if (next === history) return;
  history = next;
  restoreState(history.present);
}

function redo() {
  flushHistorySave();
  if (!history) return;
  const next = redoHistory(history);
  if (next === history) return;
  history = next;
  restoreState(history.present);
}

/* ----- Collision Detection Helper ----- */
function checkCollision(el1, el2) {
  // Check if two elements overlap
  return !(
    el1.x + el1.width <= el2.x ||
    el2.x + el2.width <= el1.x ||
    el1.y + el1.height <= el2.y ||
    el2.y + el2.height <= el1.y
  );
}

function hasCollisions(element) {
  return elements.some(other => 
    other.id !== element.id && checkCollision(element, other)
  );
}

/* ----- DOM references ----- */
const toolSelectBtn = document.getElementById('toolSelect');
const toolMoveBtn = document.getElementById('toolMove');
const toolDrawBtn = document.getElementById('toolDraw');
const toolEditBtn = document.getElementById('toolEdit');
const toolDeleteBtn = document.getElementById('toolDelete');
const elementTypesDiv = document.getElementById('elementTypes');
const templatesDiv = document.getElementById('templates');
const canvasContainer = document.getElementById('canvasContainer');
const showGridCheckbox = document.getElementById('showGrid');
const zoomLabel = document.getElementById('zoomLabel');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
const countElementsSpan = document.getElementById('countElements');
const areaSizeW = document.getElementById('areaSize');
const areaSizeH = document.getElementById('areaSizeH');
const gridWidthInput = document.getElementById('gridWidth');
const gridHeightInput = document.getElementById('gridHeight');
const propertiesWrapper = document.getElementById('propertiesWrapper');
const modeLabel = document.getElementById('modeLabel');
const shopNameInput = document.getElementById('shopName');
const launchBtn = document.getElementById('launchBtn');
const saveStatus = document.getElementById('saveStatus');
const storeContextBox = document.getElementById('storeContextBox');
const assignedBeaconsPanel = document.getElementById('assignedBeaconsPanel');
const assignedBeaconsList = document.getElementById('assignedBeaconsList');
const backLink = document.getElementById('backLink');
const layersList = document.getElementById('layersList');
const validationPanel = document.getElementById('validationPanel');
const validateBtn = document.getElementById('validateBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const publishBtn = document.getElementById('publishBtn');
const cursorPosition = document.getElementById('cursorPosition');

function hasStoreContext() {
  return Boolean(storeId);
}

function getCurrentLayoutEndpoint() {
  return hasStoreContext() ? `/api/stores/${storeId}/layout/current` : LEGACY_LAYOUT_API;
}

function getSaveLayoutEndpoint() {
  return hasStoreContext() ? `/api/stores/${storeId}/layout/versions` : LEGACY_LAYOUT_API;
}

function getEditorContextEndpoint() {
  return `/api/stores/${storeId}/layout/editor-context`;
}

/* ----- Load Categories from JSON ----- */
async function loadCategories() {
  try {
    const response = await fetch('../../assets/data/categories.json');
    const data = await response.json();
    
    // Transform JSON structure to match expected format
    PRODUCT_CATEGORIES = data.map(cat => ({
      id: cat.categoryCode.toString(),
      name: cat.categoryName,
      color: getCategoryColor(cat.categoryCode),
      icon: getCategoryIcon(cat.categoryCode)
    }));
  } catch (error) {
    console.error('Failed to load categories:', error);
    // Fallback to minimal categories
    PRODUCT_CATEGORIES = [
      { id: '310', name: 'Obst & Gemüse', color: '#4CAF50', icon: '🥬' },
      { id: '520', name: 'Molkereiprodukte', color: '#BBDEFB', icon: '🥛' },
    ];
  }
}

function setSaveStatus(message, tone = 'neutral') {
  if (!saveStatus) return;

  saveStatus.textContent = message;
  saveStatus.className = 'text-sm';

  if (tone === 'success') {
    saveStatus.classList.add('text-green-600');
  } else if (tone === 'error') {
    saveStatus.classList.add('text-red-600');
  } else {
    saveStatus.classList.add('text-gray-500');
  }
}

function findAssignedBeaconByCode(beaconCode) {
  return assignedBeacons.find(beacon => beacon.beaconCode === beaconCode) || null;
}

function enrichBeaconElement(element) {
  if (!element || element.type !== 'beacon') {
    return element;
  }

  const normalized = { ...element };
  const matchingBeacon = findAssignedBeaconByCode(normalized.beaconId)
    || assignedBeacons.find(beacon => beacon.identityKey === normalized.identityKey)
    || null;

  if (matchingBeacon) {
    normalized.beaconDbId = matchingBeacon.beaconId;
    normalized.beaconId = matchingBeacon.beaconCode;
    normalized.identityKey = matchingBeacon.identityKey;
    normalized.uuid = matchingBeacon.uuid;
    normalized.major = matchingBeacon.major;
    normalized.minor = matchingBeacon.minor;
  }

  return normalized;
}

function getUsedBeaconCodes(excludeElementId = null) {
  return new Set(
    elements
      .filter(el => el.type === 'beacon' && el.id !== excludeElementId && el.beaconId)
      .map(el => el.beaconId)
  );
}

function getNextAvailableBeacon(excludeElementId = null) {
  if (!hasStoreContext()) {
    return null;
  }

  const usedCodes = getUsedBeaconCodes(excludeElementId);
  return assignedBeacons.find(beacon => !usedCodes.has(beacon.beaconCode)) || null;
}

function createBeaconElement(x, y, excludeElementId = null) {
  const beacon = getNextAvailableBeacon(excludeElementId);
  const snappedX = Math.max(0, Math.min(Math.round(x), gridSize.width));
  const snappedY = Math.max(0, Math.min(Math.round(y), gridSize.height));

  if (hasStoreContext() && !beacon) {
    alert('Dieser Filiale sind aktuell keine freien Beacons mehr zugeordnet.');
    return null;
  }

  return enrichBeaconElement({
    id: Date.now() + Math.floor(Math.random() * 1000),
    type: 'beacon',
    beaconId: beacon ? beacon.beaconCode : `Indooro${elements.filter(el => el.type === 'beacon').length + 1}`,
    beaconDbId: beacon ? beacon.beaconId : null,
    identityKey: beacon ? beacon.identityKey : null,
    uuid: beacon ? beacon.uuid : null,
    major: beacon ? beacon.major : null,
    minor: beacon ? beacon.minor : null,
    x: snappedX,
    y: snappedY,
  });
}

function renderStoreContext() {
  if (backLink) {
    backLink.href = hasStoreContext() ? `/admin/stores/detail/?storeId=${encodeURIComponent(storeId)}` : '/admin/';
  }

  if (!hasStoreContext() || !storeContextBox || !assignedBeaconsPanel || !assignedBeaconsList) {
    return;
  }

  storeContextBox.classList.remove('hidden');
  assignedBeaconsPanel.classList.remove('hidden');

  const usedCodes = getUsedBeaconCodes();
  const freeCount = assignedBeacons.filter(beacon => !usedCodes.has(beacon.beaconCode)).length;

  storeContextBox.innerHTML = `
    <strong>${escapeHtml(storeContext?.store?.name || 'Filialeditor')}</strong><br>
    Store-Code: ${escapeHtml(storeContext?.store?.storeCode || '-')} · Zugewiesene Beacons: ${assignedBeacons.length} · Noch frei im Layout: ${freeCount}
  `;

  assignedBeaconsList.innerHTML = assignedBeacons.length
    ? assignedBeacons.map(beacon => `
        <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div class="font-semibold">${escapeHtml(beacon.beaconCode)}</div>
          <div class="text-xs text-gray-500">${escapeHtml(beacon.identityKey)}</div>
          <div class="text-xs ${usedCodes.has(beacon.beaconCode) ? 'text-emerald-700' : 'text-amber-700'}">
            ${usedCodes.has(beacon.beaconCode) ? 'Bereits im Layout platziert' : 'Noch nicht im Layout verwendet'}
          </div>
        </div>
      `).join('')
    : '<p class="text-sm text-gray-500">Dieser Filiale sind noch keine Beacons zugeordnet.</p>';
}

function normalizeImportedElements(items = []) {
  return items.map(el => {
    const normalized = { ...el };

    if (typeof normalized.category === 'string' && normalized.category.includes('/')) {
      const [category, meter] = normalized.category.split('/');
      normalized.category = category;
      normalized.meter = Number.parseInt(meter, 10) || normalized.meter;
    }

    normalized.rotation = Number.isFinite(normalized.rotation) ? normalized.rotation : 0;
    normalized.accessAngle = Number.isFinite(normalized.accessAngle) ? normalized.accessAngle : 90;
    normalized.locked = Boolean(normalized.locked);

    return enrichBeaconElement(normalized);
  });
}

function buildLayoutPayload() {
  recalcMeters();

  const exportElements = elements.map(el => {
    if (el.category !== null && el.category !== undefined) {
      return {
        ...el,
        category: `${el.category}/${el.meter}`,
        meter: el.meter ?? null,
        rotation: el.rotation || 0,
        accessAngle: el.accessAngle || 0,
        locked: Boolean(el.locked)
      };
    }

    return {
      ...el,
      rotation: el.rotation || 0,
      accessAngle: el.accessAngle || 0,
      locked: Boolean(el.locked)
    };
  });

  return {
    shopName: shopNameInput.value || 'Mein Supermarkt',
    gridSize,
    elements: exportElements,
    exportDate: new Date().toISOString()
  };
}

async function saveLayoutToServer(layoutData, activate = true) {
  const response = await fetch(getSaveLayoutEndpoint(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      hasStoreContext()
        ? {
            layoutName: shopNameInput.value || storeContext?.store?.name || 'Layout',
            changeNote: activate ? 'Im Layout-Editor publiziert' : 'Im Layout-Editor als Draft gespeichert',
            activate,
            layout: layoutData
          }
        : layoutData
    )
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/admin/';
      throw new Error('Login erforderlich.');
    }
    if (response.status === 403) {
      throw new Error('Kein Zugriff auf diese Filiale oder dieses Layout.');
    }
    throw new Error('Layout konnte nicht am Server gespeichert werden.');
  }

  const savedLayout = await response.json();
  editorLayoutId = savedLayout.layoutId || editorLayoutId;
  setSaveStatus(hasStoreContext() ? (activate ? 'Filiallayout publiziert' : 'Layout-Draft gespeichert') : 'Layout am Server gespeichert', 'success');
  renderValidation();
}

async function loadSavedLayout() {
  try {
    if (hasStoreContext()) {
      const response = await fetch(getEditorContextEndpoint(), { credentials: 'same-origin' });
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/admin/';
          throw new Error('Login erforderlich.');
        }
        if (response.status === 403) {
          throw new Error('Kein Zugriff auf diese Filiale.');
        }
        throw new Error('Kein Editor-Kontext gefunden');
      }

      storeContext = await response.json();
      assignedBeacons = storeContext.assignedBeacons || [];
      editorLayoutId = storeContext.currentLayout?.layoutId || null;

      const layoutDocument = storeContext.currentLayout?.layout;
      if (!layoutDocument || !layoutDocument.gridSize || !Array.isArray(layoutDocument.elements)) {
        throw new Error('Layout-Daten ungueltig');
      }

      shopNameInput.value = layoutDocument.shopName || storeContext.store?.name || 'Mein Supermarkt';
      gridSize = layoutDocument.gridSize || gridSize;
      gridWidthInput.value = gridSize.width;
      gridHeightInput.value = gridSize.height;
      elements = normalizeImportedElements(layoutDocument.elements || []);
      selectedElement = null;
      recalcMeters();
      renderStoreContext();
      renderProperties();
      renderCanvas();
      setSaveStatus('Filiallayout geladen', 'success');
      return;
    }

    const response = await fetch(getCurrentLayoutEndpoint(), { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('Kein gespeichertes Layout gefunden');
    }

    const data = await response.json();
    if (!data || !data.gridSize || !Array.isArray(data.elements)) {
      throw new Error('Layout-Daten ungueltig');
    }

    shopNameInput.value = data.shopName || 'Mein Supermarkt';
    gridSize = data.gridSize || gridSize;
    gridWidthInput.value = gridSize.width;
    gridHeightInput.value = gridSize.height;
    elements = normalizeImportedElements(data.elements || []);
    selectedElement = null;
    recalcMeters();
    renderProperties();
    renderCanvas();
    setSaveStatus('Gespeichertes Layout geladen', 'success');
  } catch (error) {
    renderStoreContext();
    setSaveStatus(hasStoreContext() ? 'Noch kein Filiallayout am Server' : 'Noch kein gespeichertes Layout am Server', 'neutral');
  }
}

// Helper functions for category mapping
function getCategoryColor(code) {
  const colorMap = {
    310: '#4CAF50', // Obst & Gemüse
    350: '#8D6E63', // Tierfutter
    420: '#FF9800', // Konserven
    425: '#FF5722', // Gewürze
    430: '#FFC107', // Teigwaren
    440: '#FFE082', // Müsli
    445: '#FFEB3B', // Backmittel
    450: '#FFF59D', // Öle
    470: '#E91E63', // Snacks
    490: '#6D4C41', // Kaffee und Tee
    510: '#2196F3', // Getränke
    515: '#9C27B0', // Alkoholische Getränke
    520: '#BBDEFB', // Molkerei
    525: '#FFE082', // Käse
    530: '#B3E5FC', // Tiefkühl
    610: '#795548', // Haushalt
    640: '#00BCD4', // Körperpflege
  };
  return colorMap[code] || '#E5E7EB';
}

function getCategoryIcon(code) {
  const iconMap = {
    310: '🥬', 350: '🐶', 420: '🥫', 425: '🌶️', 430: '🍝', 440: '🥣', 445: '🧁',
    450: '🫒', 470: '🍿', 490: '☕️', 510: '🥤', 515: '🍺', 520: '🥛', 525: '🧀',
    530: '❄️', 610: '🧹', 640: '🧴',
  };
  return iconMap[code] || '📦';
}

/* ----- Init UI ----- */
async function initUI() {
  // Load categories first
  await loadCategories();

  // element types
  ELEMENT_TYPES.forEach(type => {
    const btn = document.createElement('button');
    btn.className = `px-3 py-2 rounded text-sm ${currentElementType.id === type.id ? 'bg-blue-500 text-white' : 'bg-gray-100'}`;
    btn.innerText = `${type.icon} ${type.name}`;
    btn.onclick = () => {
      currentElementType = type;
      Array.from(elementTypesDiv.children).forEach(c => c.classList.remove('bg-blue-500','text-white'));
      btn.classList.add('bg-blue-500','text-white');
    };
    elementTypesDiv.appendChild(btn);
  });

  // templates
  TEMPLATES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm text-left';
    b.innerText = t.name;
    b.onclick = () => applyTemplate(t);
    templatesDiv.appendChild(b);
  });

  // grid size inputs listeners
  gridWidthInput.value = gridSize.width;
  gridHeightInput.value = gridSize.height;
  gridWidthInput.addEventListener('change', () => {
    gridSize.width = Math.max(1, parseInt(gridWidthInput.value) || 1);
    saveState();
    renderCanvas();
  });
  gridHeightInput.addEventListener('change', () => {
    gridSize.height = Math.max(1, parseInt(gridHeightInput.value) || 1);
    saveState();
    renderCanvas();
  });

  // tool buttons
  toolSelectBtn.onclick = () => setTool('select');
  toolMoveBtn.onclick = () => setTool('move');
  toolDrawBtn.onclick = () => setTool('draw');
  toolEditBtn.onclick = () => setTool('edit');
  toolDeleteBtn.onclick = () => setTool('delete');

  // grid toggle
  showGridCheckbox.onchange = () => { showGrid = showGridCheckbox.checked; renderCanvas(); };

  // zoom
  function setZoom(z) { zoom = Math.max(0.1, Math.min(3, Math.round(z*10)/10)); zoomLabel.innerText = Math.round(zoom*100)+'%'; renderCanvas(); }
  zoomInBtn.onclick = () => setZoom(zoom + 0.1);
  zoomOutBtn.onclick = () => setZoom(zoom - 0.1);

  // export/import
  exportBtn.onclick = exportLayout;
  fileInput.onchange = importLayout;
  validateBtn.onclick = () => renderValidation(true);
  saveDraftBtn.onclick = async () => {
    const layoutData = buildLayoutPayload();
    await saveLayoutToServer(layoutData, false);
  };
  publishBtn.onclick = async () => {
    const layoutData = buildLayoutPayload();
    const validation = renderValidation(true);
    if (!validation.readyToPublish) {
      setSaveStatus('Publish blockiert: Validierung enthaelt Fehler', 'error');
      return;
    }
    if (validation.warningCount && !window.confirm(`${validation.warningCount} Warnung(en) bleiben bestehen. Trotzdem publizieren?`)) {
      return;
    }
    await saveLayoutToServer(layoutData, true);
  };
  document.getElementById('newBtn').onclick = () => {
  if (confirm('Möchtest du wirklich ein neues Layout starten? Alle aktuellen Elemente gehen verloren.')) {
    elements = [];
    selectedElement = null;
    saveState();
    renderProperties();
    renderCanvas();
  }
};


  // shop name
  shopNameInput.addEventListener('input', () => { shopName = shopNameInput.value; queueHistorySave(); });

  // Launch button
  launchBtn.onclick = launchSimulation;

  // Keyboard shortcuts for undo/redo
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    // Undo: Ctrl+Z or Cmd+Z
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    // Redo: Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z
    else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
      e.preventDefault();
      redo();
    }
  });

  // Arrow key navigation for selected element
  window.addEventListener('keydown', (e) => {
    // Check if user is typing in an input or textarea
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );
    
    // Only process arrow keys if not typing and an element is selected
    if (!isTyping && selectedElement && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      flushHistorySave();
      const el = selectedElement;
      
      switch(e.key) {
        case 'ArrowUp':
          el.y = Math.max(0, el.y - 1);
          break;
        case 'ArrowDown':
          el.y = Math.min(gridSize.height - el.height, el.y + 1);
          break;
        case 'ArrowLeft':
          el.x = Math.max(0, el.x - 1);
          break;
        case 'ArrowRight':
          el.x = Math.min(gridSize.width - el.width, el.x + 1);
          break;
      }
      
      // Update element in array
      elements = elements.map(it => it.id === el.id ? el : it);
      saveState();
      renderCanvas();
      renderProperties();
    }
  });

  // initial render
  await loadSavedLayout();
  setTool('select');
  saveState(); // Initial state after loading
  renderCanvas();
}

async function launchSimulation() {
  const layoutData = buildLayoutPayload();

  try {
    localStorage.setItem('indooro_live_layout', JSON.stringify(layoutData));
    await saveLayoutToServer(layoutData, false);
    window.open('/customer/', '_blank');
  } catch (error) {
    alert('Fehler beim Starten der Simulation: ' + error.message);
    setSaveStatus(error.message, 'error');
  }
}

/* ----- Tool management ----- */
function setTool(t) {
  currentTool = t;
  [toolSelectBtn, toolMoveBtn, toolDrawBtn, toolEditBtn, toolDeleteBtn].forEach(btn => {
    btn.classList.remove('bg-blue-500', 'text-white', 'active');
    btn.classList.add('bg-gray-100');
  });
  const activeButton = {
    select: toolSelectBtn,
    move: toolMoveBtn,
    draw: toolDrawBtn,
    edit: toolEditBtn,
    delete: toolDeleteBtn
  }[t] || toolSelectBtn;
  activeButton.classList.add('bg-blue-500', 'text-white', 'active');
  activeButton.classList.remove('bg-gray-100');
  const labels = {
    select: 'Auswahlmodus',
    move: 'Verschieben',
    draw: 'Zeichnen/Add',
    edit: 'Inspector Edit',
    delete: 'Loeschmodus'
  };
  modeLabel.innerText = labels[t] || 'Auswahlmodus';
}

/* ----- Canvas rendering ----- */
function renderCanvas() {
  // size container
  const widthPx = gridSize.width * cellSize * zoom;
  const heightPx = gridSize.height * cellSize * zoom;
  canvasContainer.style.width = widthPx + 'px';
  canvasContainer.style.height = heightPx + 'px';

  // content
  canvasContainer.innerHTML = '';

  // grid SVG
  if (showGrid) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','absolute inset-0 pointer-events-none');
    svg.setAttribute('width', widthPx);
    svg.setAttribute('height', heightPx);
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.position = 'absolute';

    for (let i=0;i<=gridSize.width;i++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', i*cellSize*zoom);
      line.setAttribute('y1', 0);
      line.setAttribute('x2', i*cellSize*zoom);
      line.setAttribute('y2', heightPx);
      line.setAttribute('stroke', '#e5e7eb');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    for (let i=0;i<=gridSize.height;i++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', 0);
      line.setAttribute('y1', i*cellSize*zoom);
      line.setAttribute('x2', widthPx);
      line.setAttribute('y2', i*cellSize*zoom);
      line.setAttribute('stroke', '#e5e7eb');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    canvasContainer.appendChild(svg);
  }

  // elements
  elements.forEach(el => {
    const isBeacon = el.type === 'beacon';
    
    if (isBeacon) {
      // Render beacon as circular element
      renderBeaconElement(el);
    } else {
      // Render regular element
      renderRegularElement(el);
    }
  });

  // drawing preview
  if (isDrawing && drawStart) {
    const isBeaconTool = currentElementType.id === 'beacon';
    
    if (isBeaconTool) {
      // Beacon preview: small circle snapped to grid
      const preview = document.createElement('div');
      preview.className = 'absolute rounded-full border-2 border-dashed border-blue-500 bg-blue-200 opacity-50';
      const beaconSize = cellSize * zoom * 0.8; // 80% of cell size
      const snappedX = Math.round(currentMouseCell.x);
      const snappedY = Math.round(currentMouseCell.y);
      preview.style.left = (snappedX * cellSize * zoom - beaconSize/2) + 'px';
      preview.style.top = (snappedY * cellSize * zoom - beaconSize/2) + 'px';
      preview.style.width = beaconSize + 'px';
      preview.style.height = beaconSize + 'px';
      canvasContainer.appendChild(preview);
    } else {
      // Regular rectangle preview
      const preview = document.createElement('div');
      preview.className = 'absolute border-2 border-dashed border-blue-500 bg-blue-100 opacity-50';
      const dx = Math.min(drawStart.x, currentMouseCell.x);
      const dy = Math.min(drawStart.y, currentMouseCell.y);
      const w = Math.abs(currentMouseCell.x - drawStart.x) + 1;
      const h = Math.abs(currentMouseCell.y - drawStart.y) + 1;
      preview.style.left = (dx * cellSize * zoom) + 'px';
      preview.style.top = (dy * cellSize * zoom) + 'px';
      preview.style.width = (w * cellSize * zoom) + 'px';
      preview.style.height = (h * cellSize * zoom) + 'px';
      canvasContainer.appendChild(preview);
    }
  }

  // update counters
  countElementsSpan.innerText = elements.length;
  areaSizeW.innerText = gridSize.width;
  areaSizeH.innerText = gridSize.height;
  renderLayers();
  renderValidation();
  renderStoreContext();
}

/* ----- Render Beacon Element ----- */
function renderBeaconElement(el) {
  const beaconSize = cellSize * zoom * 0.8; // 80% of cell size for compact look
  
  const div = document.createElement('div');
  div.className = 'absolute element-box beacon-element flex items-center justify-center text-center overflow-hidden';
  if (selectedElement && selectedElement.id === el.id) div.classList.add('selected');
  
  // Position beacon centered on its grid coordinates (snapped to integers)
  const snappedX = Math.round(el.x);
  const snappedY = Math.round(el.y);
  div.style.left = (snappedX * cellSize * zoom - beaconSize/2) + 'px';
  div.style.top = (snappedY * cellSize * zoom - beaconSize/2) + 'px';
  div.style.width = beaconSize + 'px';
  div.style.height = beaconSize + 'px';
  div.dataset.id = el.id;
  
  // Tooltip
  div.title = `Beacon: ${el.beaconId || 'Unbenannt'}\nPosition: (${el.x}m, ${el.y}m)${el.identityKey ? `\nIdentity: ${el.identityKey}` : ''}`;

  const inner = document.createElement('div');
  inner.className = 'flex flex-col items-center justify-center gap-0';
  inner.innerHTML = `
    <div class="beacon-icon">📡</div>
    <div class="beacon-label">${escapeHtml(el.beaconId || '')}</div>
  `;
  div.appendChild(inner);

  // click to select
  div.addEventListener('mousedown', (ev) => {
    ev.stopPropagation();
    if (currentTool === 'delete') {
      deleteSelectedElement(el);
      return;
    }
    const rect = canvasContainer.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / (cellSize * zoom);
    const y = (ev.clientY - rect.top) / (cellSize * zoom);
    selectedElement = el;
    isDragging = true;
    dragMoved = false;
    dragOffset = { x: x - el.x, y: y - el.y };
    renderCanvas();
    renderProperties();
  });

  canvasContainer.appendChild(div);
}

/* ----- Render Regular Element ----- */
function renderRegularElement(el) {
  const cat = el.category ? PRODUCT_CATEGORIES.find(c => c.id === el.category) : null;
  // Meter anzeigen falls vorhanden
  const meterText = el.meter ? `Meter ${el.meter}` : '';
  const elementType = ELEMENT_TYPES.find(t => t.id === el.type) || ELEMENT_TYPES[0];
  
  // Check for collisions
  const hasCollision = hasCollisions(el);
  
  const div = document.createElement('div');
  div.className = 'absolute border-2 element-box flex items-center justify-center text-center text-xs font-medium overflow-hidden';
  if (selectedElement && selectedElement.id === el.id) div.classList.add('selected');
  
  // Apply collision styling
  if (hasCollision) {
    div.classList.add('border-red-600');
    div.style.borderWidth = '3px';
  }
  
  div.style.left = (el.x * cellSize * zoom) + 'px';
  div.style.top = (el.y * cellSize * zoom) + 'px';
  div.style.width = (el.width * cellSize * zoom) + 'px';
  div.style.height = (el.height * cellSize * zoom) + 'px';
  div.style.transform = `rotate(${el.rotation || 0}deg)`;
  div.style.transformOrigin = 'center';
  
  // Background color with collision warning
  if (hasCollision) {
    div.style.backgroundColor = '#fca5a5';
  } else {
    div.style.backgroundColor = el.color || '#E5E7EB';
  }
  
  div.style.opacity = '0.95';

  if (el.locked) {
    div.style.opacity = '0.7';
    div.style.border = '2px dashed #333';
    div.style.backgroundColor = '#d1d5db'; // grau
  }

  div.dataset.id = el.id;
  
  // Add tooltip with full information
  const tooltipText = `${elementType.name}${cat ? ' - ' + cat.name : ' - Leer'}${hasCollision ? ' ⚠️ ÜBERLAPPUNG!' : ''}`;
  div.title = tooltipText;

  const inner = document.createElement('div');
  inner.className = 'p-1 flex flex-col items-center justify-center';
  const icon = cat ? cat.icon : '📦';
  
  // Refined smart rendering: hide text if element is narrow in ANY dimension
  const isNarrow = el.width < 2 || el.height < 2;
  
  if (isNarrow) {
    inner.innerHTML = `<div class="text-lg">${escapeHtml(icon)}</div>`;
  } else {
    inner.innerHTML = `
      <div class="font-bold text-[11px] mb-0.5 px-1.5 py-0.5 bg-white bg-opacity-70 rounded">
        ${escapeHtml(elementType.name)}
      </div>

      <div class="text-lg">${escapeHtml(icon)}</div>

      <div class="text-[10px] leading-tight">${escapeHtml(el.label)}</div>

      <div class="text-[9px] text-gray-700 font-semibold">
        ${escapeHtml(meterText)}
      </div>
    `;
  }
  div.appendChild(inner);

  // click to select
  div.addEventListener('mousedown', (ev) => {
    ev.stopPropagation();
    if (currentTool === 'delete') {
      deleteSelectedElement(el);
      return;
    }
    const rect = canvasContainer.getBoundingClientRect();
    const x = Math.round((ev.clientX - rect.left) / (cellSize * zoom));
    const y = Math.round((ev.clientY - rect.top) / (cellSize * zoom));
    selectedElement = el;
    isDragging = true;
    dragMoved = false;
    dragOffset = { x: x - el.x, y: y - el.y };
    renderCanvas();
    renderProperties();
  });

  // 🔄 ROTATE HANDLE (deutlich sichtbar)
  const rotateHandle = document.createElement('div');
  rotateHandle.className = 'absolute cursor-pointer';
  rotateHandle.innerHTML = '🔄';
  rotateHandle.style.cursor = 'grab';

  // größer & auffälliger
  rotateHandle.style.fontSize = '20px';

  // Position: über dem Regal
  rotateHandle.style.top = '20px';
  rotateHandle.style.left = '50%';
  rotateHandle.style.transform = 'translateX(-50%)';

  // Hover-Effekt (optional nice)
  rotateHandle.style.transition = 'transform 0.1s';

  rotateHandle.addEventListener('mouseenter', () => {
    rotateHandle.style.transform = 'translateX(-50%) scale(1.2)';
  });

  rotateHandle.addEventListener('mouseleave', () => {
    rotateHandle.style.transform = 'translateX(-50%) scale(1)';
  });

  rotateHandle.addEventListener('mousedown', (e) => {
    if (el.locked) return;

    selectedElement = el;
    isRotating = true;
    showRotationUI = true;

    renderCanvas();

    rotateHandle.style.cursor = 'grabbing';

    e.stopPropagation();

    const rect = canvasContainer.getBoundingClientRect();

    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;

    const startMouseX = (e.clientX - rect.left) / (cellSize * zoom);
    const startMouseY = (e.clientY - rect.top) / (cellSize * zoom);

    const startAngle = Math.atan2(startMouseY - centerY, startMouseX - centerX) * (180 / Math.PI);

    const initialRotation = el.rotation || 0;

    function onMove(ev) {
      const rect = canvasContainer.getBoundingClientRect();

      const mx = (ev.clientX - rect.left) / (cellSize * zoom);
      const my = (ev.clientY - rect.top) / (cellSize * zoom);

      const currentAngle = Math.atan2(my - centerY, mx - centerX) * (180 / Math.PI);

      // 🔥 relative Rotation berechnen
      let delta = currentAngle - startAngle;

      let newRotation = initialRotation + delta;

      // optional: normalisieren (-180 bis 180)
      if (newRotation > 180) newRotation -= 360;
      if (newRotation < -180) newRotation += 360;

      // runden
      el.rotation = Math.round(newRotation * 100) / 100;

      renderCanvas();
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      isRotating = false;

      rotateHandle.style.cursor = 'grab';

      saveState();
      renderCanvas();
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  div.appendChild(rotateHandle);


  // 🔒 Lock Button
  const lockBtn = document.createElement('div');
  lockBtn.className = 'absolute cursor-pointer';

  lockBtn.innerHTML = el.locked ? '🔒' : '🔓';

  // bessere Position (im Regal oben rechts innen)
  lockBtn.style.top = '4px';
  lockBtn.style.right = '4px';
  lockBtn.style.fontSize = '18px';
  lockBtn.style.zIndex = '10';

  // leichter Hintergrund damit sichtbar
  lockBtn.style.background = 'rgba(255,255,255,0.7)';
  lockBtn.style.borderRadius = '6px';
  lockBtn.style.padding = '2px 4px';

  lockBtn.addEventListener('mousedown', (e) => {
  e.stopPropagation(); // verhindert Drag
  e.preventDefault();  // verhindert Fokus-Probleme

  el.locked = !el.locked;
  saveState();

  lockBtn.style.transform = 'scale(1.3)';
  setTimeout(() => {
    lockBtn.style.transform = 'scale(1)';
  }, 120);

  renderCanvas();
});

  div.appendChild(lockBtn);

  // ⬇️ ACCESS ARROW (klar sichtbar & sauber zentriert)
  const arrow = document.createElement('div');
  arrow.className = 'absolute';
  arrow.innerHTML = '⬇️';

  // größer machen
  arrow.style.fontSize = '20px';

  // besser positionieren (näher am Regal)
  arrow.style.left = '50%';
  arrow.style.bottom = '10%';
  arrow.style.marginTop = '2px';

  // sauber zentrieren
  arrow.style.transform = 'translateX(-50%)';

  div.appendChild(arrow);

  // 🔥 ROTATION BOX
  if (showRotationUI && selectedElement && selectedElement.id === el.id) {
    const angleBox = document.createElement('div');
    angleBox.className = 'absolute bg-white border rounded shadow px-2 py-1 text-xs';

    const centerX = (el.x + el.width / 2) * cellSize * zoom;
    const topY = (el.y * cellSize * zoom) - 50;

    angleBox.style.left = centerX + 'px';
    angleBox.style.top = topY + 'px';
    angleBox.style.transform = 'translateX(-50%)';
    angleBox.style.position = 'absolute';
    angleBox.style.zIndex = '9999';

    angleBox.innerHTML = `
    <input 
      type="number" 
      value="${(el.rotation || 0).toFixed(2)}" 
        step="0.1"
        class="w-16 text-center border rounded text-xs"
      />°
    `;

    const input = angleBox.querySelector('input');

    input.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    input.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    input.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        el.rotation = Math.round(val * 100) / 100;
        queueHistorySave();
      }
    });

    input.addEventListener('change', () => {
      flushHistorySave();
      renderCanvas();
    });

    canvasContainer.appendChild(angleBox);
  }

  canvasContainer.appendChild(div);
}

/* track mouse cell for preview with snapping */
let currentMouseCell = { x: 0, y: 0 };

/* ----- Mouse events on canvasContainer ----- */
canvasContainer.addEventListener('mousedown', (e) => {
  if (!isRotating) {
    showRotationUI = false;
  }
  const rect = canvasContainer.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) / (cellSize * zoom));
  const y = Math.round((e.clientY - rect.top) / (cellSize * zoom));
  if (currentTool === 'select') {
    // click on empty space -> deselect
    const clicked = elements.find(el =>
      x >= el.x && x < el.x + el.width && y >= el.y && y < el.y + el.height
    );
    if (!clicked) {
      selectedElement = null;
      renderProperties();
      renderCanvas();
    } else {
      // handled by element mousedown handler (stops propagation)
    }
  } else if (currentTool === 'draw') {
    isDrawing = true;
    drawStart = { x, y };
    currentMouseCell = { x, y };
    renderCanvas();
  }
});

window.addEventListener('mousemove', (e) => {
  // compute mouse in canvas coords if inside container
  const rect = canvasContainer.getBoundingClientRect();
  const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!inside && !isDragging && !isDrawing) return;

  const x = (e.clientX - rect.left) / (cellSize * zoom);
  const y = (e.clientY - rect.top) / (cellSize * zoom);
  currentMouseCell = { x: Math.round(x), y: Math.round(y) };
  if (cursorPosition) {
    cursorPosition.textContent = `x: ${currentMouseCell.x} y: ${currentMouseCell.y}`;
  }

  if (isDragging && selectedElement && !selectedElement.locked) {
    if (!['select', 'move', 'edit'].includes(currentTool)) return;
    const isBeacon = selectedElement.type === 'beacon';
    const previousX = selectedElement.x;
    const previousY = selectedElement.y;
    
    if (isBeacon) {
      // Beacons snap to grid intersections (whole numbers)
      const newX = Math.round(x - dragOffset.x);
      const newY = Math.round(y - dragOffset.y);
      selectedElement.x = Math.max(0, Math.min(newX, gridSize.width));
      selectedElement.y = Math.max(0, Math.min(newY, gridSize.height));
    } else {
      // Regular elements snap to grid
      selectedElement.x = Math.round(x - dragOffset.x);
      selectedElement.y = Math.round(y - dragOffset.y);
      selectedElement.x = Math.max(0, Math.min(selectedElement.x, gridSize.width - selectedElement.width));
      selectedElement.y = Math.max(0, Math.min(selectedElement.y, gridSize.height - selectedElement.height));
    }
    dragMoved ||= selectedElement.x !== previousX || selectedElement.y !== previousY;
    
    elements = elements.map(el => el.id === selectedElement.id ? selectedElement : el);
    renderCanvas();
    renderProperties();
  } else if (isDrawing && drawStart) {
    renderCanvas();
  }
});

window.addEventListener('mouseup', (e) => {
  const rect = canvasContainer.getBoundingClientRect();
  const x = (e.clientX - rect.left) / (cellSize * zoom);
  const y = (e.clientY - rect.top) / (cellSize * zoom);

  if (isDrawing && drawStart) {
    const isBeaconTool = currentElementType.id === 'beacon';
    
    if (isBeaconTool) {
      const newBeacon = createBeaconElement(x, y);
      if (newBeacon) {
        elements.push(newBeacon);
        selectedElement = newBeacon;
      }
    } else {
      // Create regular element
      const nx = Math.max(0, Math.min(gridSize.width-1, Math.round(x)));
      const ny = Math.max(0, Math.min(gridSize.height-1, Math.round(y)));

      const newElement = {
        id: Date.now() + Math.floor(Math.random()*1000),
        type: currentElementType.id,
        category: null,
        x: Math.min(drawStart.x, nx),
        y: Math.min(drawStart.y, ny),
        width: Math.abs(nx - drawStart.x) + 1,
        height: Math.abs(ny - drawStart.y) + 1,
        label: 'Leer',
        color: '#E5E7EB',
        rotation: 0,
        accessAngle: 90,
        locked: false
      };
      elements.push(newElement);
      selectedElement = newElement;
    }
    
    renderProperties();
    saveState();
    renderCanvas();
  }

  const wasDragging = isDragging && dragMoved;

  isDrawing = false;
  drawStart = null;
  isDragging = false;
  dragMoved = false;

  // Nur wenn wirklich gezogen wurde:
  if (wasDragging) {
    recalcMeters();
    saveState();
    renderCanvas();
    renderProperties();
  }
});

function deleteSelectedElement(el) {
  if (!el) return;
  const critical = ['beacon', 'entrance', 'checkout', 'shelf', 'counter', 'cooler', 'freezer'].includes(el.type);
  if (critical && !window.confirm(`${el.label || el.beaconId || el.type} wirklich entfernen?`)) {
    return;
  }
  elements = elements.filter(item => item.id !== el.id);
  selectedElement = null;
  saveState();
  renderProperties();
  renderCanvas();
}

/* clicking outside canvas should stop dragging/drawing */
window.addEventListener('blur', () => { isDrawing = false; isDragging = false; dragMoved = false; renderCanvas(); });

/* delete key support */
window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Check if user is typing in an input or textarea
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );
    
    // Only delete element if not typing in a text field
    if (!isTyping && selectedElement) {
      e.preventDefault(); // Prevent browser back navigation
      flushHistorySave();
      elements = elements.filter(el => el.id !== selectedElement.id);
      selectedElement = null;
      saveState();
      renderProperties();
      renderCanvas();
    }
  }
});

/* ----- Properties panel ----- */
function renderProperties() {
  if (!selectedElement) {
    propertiesWrapper.innerHTML = '<p class="text-sm text-gray-500">Wähle ein Element aus, um seine Eigenschaften zu bearbeiten.</p>';
    renderLayers();
    return;
  }

  const el = selectedElement;
  const isBeacon = el.type === 'beacon';
  
  if (isBeacon) {
    renderBeaconProperties(el);
  } else {
    renderRegularProperties(el);
  }
  renderLayers();
}

function renderLayers() {
  if (!layersList) return;
  if (!elements.length) {
    layersList.innerHTML = '<div class="muted">Noch keine Elemente.</div>';
    return;
  }
  const grouped = elements.reduce((acc, element) => {
    const key = element.type || 'element';
    acc[key] = acc[key] || [];
    acc[key].push(element);
    return acc;
  }, {});
  layersList.innerHTML = Object.entries(grouped).map(([type, items]) => `
    <div class="layer-group">
      <h3>${escapeHtml(type)} (${items.length})</h3>
      ${items.map((element) => `
        <button class="layer-item ${selectedElement?.id === element.id ? 'active' : ''}" data-layer-id="${escapeHtml(element.id)}">
          <span>${escapeHtml(element.label || element.beaconId || element.type)}</span>
          <span>${element.locked ? 'Locked' : 'Visible'}</span>
        </button>
      `).join('')}
    </div>
  `).join('');
  layersList.querySelectorAll('[data-layer-id]').forEach(button => {
    button.addEventListener('click', () => {
      selectedElement = elements.find(element => String(element.id) === button.dataset.layerId);
      renderCanvas();
      renderProperties();
    });
  });
}

function renderValidation(explicit = false) {
  const validation = validateLayoutDocument(
    {
      shopName: shopNameInput.value,
      gridSize,
      width: gridSize.width,
      height: gridSize.height,
      elements
    },
    { assignedBeacons }
  );
  if (!validationPanel) return validation;
  if (!explicit && !validation.issues.length) {
    validationPanel.innerHTML = '<div class="validation-item">Keine blockierenden Probleme erkannt.</div>';
    return validation;
  }
  validationPanel.innerHTML = validation.issues.length
    ? validation.issues.map(issue => `
        <button class="validation-item ${escapeHtml(issue.severity)}" ${issue.elementId ? `data-validation-element="${escapeHtml(issue.elementId)}"` : ''}>
          <strong>${issue.severity === 'error' ? 'Fehler' : 'Warnung'}</strong><br>${escapeHtml(issue.message)}
        </button>
      `).join('')
    : '<div class="validation-item">Layout ist publikationsbereit.</div>';
  validationPanel.querySelectorAll('[data-validation-element]').forEach(button => {
    button.addEventListener('click', () => {
      selectedElement = elements.find(element => String(element.id) === button.dataset.validationElement);
      renderCanvas();
      renderProperties();
    });
  });
  return validation;
}

/* ----- Beacon Properties Panel ----- */
function renderBeaconProperties(el) {
  const container = document.createElement('div');
  container.className = 'space-y-4';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between pb-3 border-b';
  header.innerHTML = `<h4 class="font-medium">📡 Beacon bearbeiten</h4>`;
  
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'flex gap-1';
  
  const duplicateBtn = document.createElement('button');
  duplicateBtn.className = 'p-2 text-blue-500 hover:bg-blue-50 rounded';
  duplicateBtn.title = 'Duplizieren';
  duplicateBtn.innerHTML = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-width="2"/></svg>';
  duplicateBtn.onclick = () => {
    const duplicate = createBeaconElement(Math.min(el.x + 2, gridSize.width), el.y, el.id);
    if (!duplicate) {
      return;
    }
    elements.push(duplicate);
    selectedElement = duplicate;
    saveState();
    renderCanvas();
    renderProperties();
  };
  
  const delBtn = document.createElement('button');
  delBtn.className = 'p-2 text-red-500 hover:bg-red-50 rounded';
  delBtn.title = 'Löschen';
  delBtn.innerHTML = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  delBtn.onclick = () => {
    elements = elements.filter(it => it.id !== el.id);
    selectedElement = null;
    saveState();
    renderProperties();
    renderCanvas();
  };
  
  actionsDiv.appendChild(duplicateBtn);
  actionsDiv.appendChild(delBtn);
  header.appendChild(actionsDiv);
  container.appendChild(header);

  // Beacon ID input
  const idDiv = document.createElement('div');
  const usedBeaconCodes = getUsedBeaconCodes(el.id);
  if (hasStoreContext()) {
    idDiv.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">Zugewiesener Beacon</label>
        <select id="propBeaconId" class="w-full px-2 py-1 border border-gray-300 rounded">
          ${assignedBeacons.map(beacon => `
            <option value="${escapeHtml(beacon.beaconCode)}"
              ${beacon.beaconCode === el.beaconId ? 'selected' : ''}
              ${usedBeaconCodes.has(beacon.beaconCode) ? 'disabled' : ''}>
              ${escapeHtml(beacon.beaconCode)} · ${escapeHtml(beacon.identityKey)}
            </option>
          `).join('')}
        </select>
        <p class="text-xs text-gray-500 mt-1">Es koennen nur die dieser Filiale zugeordneten Beacons verwendet werden.</p>
      </div>
    `;
  } else {
    idDiv.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">Beacon ID (Hardware-Name)</label>
        <input id="propBeaconId" type="text" value="${escapeHtml(el.beaconId || '')}" 
               placeholder="z.B. Indooro1" 
               class="w-full px-2 py-1 border border-gray-300 rounded" />
        <p class="text-xs text-gray-500 mt-1">Muss mit dem Hardware-Namen uebereinstimmen</p>
      </div>
    `;
  }
  container.appendChild(idDiv);

  // Position display - now integer values for grid snapping
  const posDiv = document.createElement('div');
  posDiv.innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-sm font-medium mb-1">X-Position (m)</label>
        <input id="propBeaconX" type="number" value="${el.x}" step="1" min="0" max="${gridSize.width}"
               class="w-full px-2 py-1 border border-gray-300 rounded" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Y-Position (m)</label>
        <input id="propBeaconY" type="number" value="${el.y}" step="1" min="0" max="${gridSize.height}"
               class="w-full px-2 py-1 border border-gray-300 rounded" />
      </div>
    </div>
    <p class="text-xs text-gray-500 mt-1">Koordinaten rasten automatisch am Gitter ein</p>
  `;
  container.appendChild(posDiv);

  // Info box
  const infoDiv = document.createElement('div');
  infoDiv.className = 'bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800';
  infoDiv.innerHTML = `
    <strong>💡 Tipp:</strong> Beacons rasten an Gitterpunkten ein. 
    Positionieren Sie sie an Säulen oder Deckenmontagen für präzise Indoor-Navigation.
  `;
  container.appendChild(infoDiv);

  propertiesWrapper.innerHTML = '';
  propertiesWrapper.appendChild(container);

  // Event listeners
  const beaconIdInput = document.getElementById('propBeaconId');
  if (hasStoreContext()) {
    beaconIdInput.addEventListener('change', (ev) => {
      const selectedBeacon = findAssignedBeaconByCode(ev.target.value);
      if (!selectedBeacon) {
        return;
      }
      el.beaconId = selectedBeacon.beaconCode;
      el.beaconDbId = selectedBeacon.beaconId;
      el.identityKey = selectedBeacon.identityKey;
      el.uuid = selectedBeacon.uuid;
      el.major = selectedBeacon.major;
      el.minor = selectedBeacon.minor;
      elements = elements.map(it => it.id === el.id ? el : it);
      saveState();
      renderCanvas();
      renderProperties();
    });
  } else {
    beaconIdInput.addEventListener('input', (ev) => {
      el.beaconId = ev.target.value;
      elements = elements.map(it => it.id === el.id ? el : it);
      renderCanvas();
      queueHistorySave();
    });
  }

  document.getElementById('propBeaconX').addEventListener('change', (ev) => {
    el.x = Math.max(0, Math.min(Math.round(parseFloat(ev.target.value) || 0), gridSize.width));
    elements = elements.map(it => it.id === el.id ? el : it);
    saveState();
    renderCanvas();
    renderProperties();
  });

  document.getElementById('propBeaconY').addEventListener('change', (ev) => {
    el.y = Math.max(0, Math.min(Math.round(parseFloat(ev.target.value) || 0), gridSize.height));
    elements = elements.map(it => it.id === el.id ? el : it);
    saveState();
    renderCanvas();
    renderProperties();
  });
}

/* ----- Regular Element Properties Panel ----- */
function renderRegularProperties(el) {
  const cat = el.category ? PRODUCT_CATEGORIES.find(c => c.id === el.category) : null;

  const container = document.createElement('div');
  container.className = 'space-y-4';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between pb-3 border-b';
  header.innerHTML = `<h4 class="font-medium">Element bearbeiten</h4>`;
  
  // Action buttons (delete and duplicate)
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'flex gap-1';
  
  const duplicateBtn = document.createElement('button');
  duplicateBtn.className = 'p-2 text-blue-500 hover:bg-blue-50 rounded';
  duplicateBtn.title = 'Duplizieren';
  duplicateBtn.innerHTML = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-width="2"/></svg>';
  duplicateBtn.onclick = () => {
    const duplicate = JSON.parse(JSON.stringify(el));
    duplicate.id = Date.now() + Math.floor(Math.random() * 1000);
    
    let newX = el.x + el.width;
    let newY = el.y;
    
    if (newX + duplicate.width > gridSize.width) {
      newX = el.x;
      newY = el.y + el.height;
      
      if (newY + duplicate.height > gridSize.height) {
        newX = Math.min(el.x + 1, gridSize.width - duplicate.width);
        newY = Math.min(el.y + 1, gridSize.height - duplicate.height);
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
      }
    }
    
    duplicate.x = newX;
    duplicate.y = newY;
    
    elements.push(duplicate);
    selectedElement = duplicate;
    saveState();
    
    renderCanvas();
    renderProperties();
  };
  
  const delBtn = document.createElement('button');
  delBtn.className = 'p-2 text-red-500 hover:bg-red-50 rounded';
  delBtn.title = 'Löschen';
  delBtn.innerHTML = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  delBtn.onclick = () => {
    elements = elements.filter(it => it.id !== el.id);
    selectedElement = null;
    saveState();
    renderProperties();
    renderCanvas();
  };
  
  actionsDiv.appendChild(duplicateBtn);
  actionsDiv.appendChild(delBtn);
  header.appendChild(actionsDiv);
  container.appendChild(header);

  // label
  const labelDiv = document.createElement('div');
  labelDiv.innerHTML = `
    <div>
      <label class="block text-sm font-medium mb-1">Bezeichnung</label>
      <input id="propLabel" type="text" value="${escapeHtml(el.label)}" class="w-full px-2 py-1 border border-gray-300 rounded" />
    </div>
  `;
  container.appendChild(labelDiv);

  // Category selection
  const categorySection = document.createElement('div');
  categorySection.innerHTML = `
    <label class="block text-sm font-medium mb-2">Produktkategorie</label>
    <div id="categoriesList" class="space-y-1 max-h-64 overflow-y-auto border rounded p-2">
    </div>
  `;
  container.appendChild(categorySection);

  const categoriesList = categorySection.querySelector('#categoriesList');
  PRODUCT_CATEGORIES.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `w-full px-2 py-1.5 rounded text-left text-xs flex items-center gap-2 ${el.category === c.id ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50'}`;
    btn.style.backgroundColor = el.category === c.id ? c.color : 'transparent';
    btn.innerHTML = `<span>${escapeHtml(c.icon)}</span><span class="flex-1">${escapeHtml(c.name)}</span>`;
    btn.onclick = () => {
      el.category = c.id;
      el.color = c.color;
      el.label = c.name;
      elements = elements.map(it => it.id === el.id ? el : it);
      saveState();
      renderCanvas();
      renderProperties();
    };
    categoriesList.appendChild(btn);
  });

  // dimensions with rotate button
  const dimDiv = document.createElement('div');
  dimDiv.innerHTML = `
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-sm font-medium mb-1">Breite</label>
          <input id="propW" type="number" value="${el.width}" min="1" class="w-full px-2 py-1 border border-gray-300 rounded" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Höhe</label>
          <input id="propH" type="number" value="${el.height}" min="1" class="w-full px-2 py-1 border border-gray-300 rounded" />
        </div>
      </div>
      <button id="rotateBtn" class="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm flex items-center justify-center gap-2">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Drehen (90°)
      </button>
    </div>
  `;
  container.appendChild(dimDiv);

  propertiesWrapper.innerHTML = '';
  propertiesWrapper.appendChild(container);

  // listeners
  document.getElementById('propLabel').addEventListener('input', (ev) => {
    el.label = ev.target.value;
    elements = elements.map(it => it.id === el.id ? el : it);
    renderCanvas();
    queueHistorySave();
  });

  document.getElementById('propW').addEventListener('change', (ev) => {
    el.width = Math.max(1, Math.round(parseFloat(ev.target.value)) || 1);
    el.width = Math.min(el.width, gridSize.width - el.x);
    elements = elements.map(it => it.id === el.id ? el : it);
    saveState();
    renderCanvas();
    renderProperties();
  });

  document.getElementById('propH').addEventListener('change', (ev) => {
    el.height = Math.max(1, Math.round(parseFloat(ev.target.value)) || 1);
    el.height = Math.min(el.height, gridSize.height - el.y);
    elements = elements.map(it => it.id === el.id ? el : it);
    saveState();
    renderCanvas();
    renderProperties();
  });

  // Rotate button handler
  document.getElementById('rotateBtn').addEventListener('click', () => {
    // Swap width and height
    const newWidth = el.height;
    const newHeight = el.width;
    
    // Check if rotation would push element out of bounds
    let newX = el.x;
    let newY = el.y;
    
    // Adjust position if needed to keep element within grid
    if (newX + newWidth > gridSize.width) {
      newX = gridSize.width - newWidth;
    }
    if (newY + newHeight > gridSize.height) {
      newY = gridSize.height - newHeight;
    }
    
    // Ensure position is not negative
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);
    
    // Apply rotation
    el.width = newWidth;
    el.height = newHeight;
    el.x = newX;
    el.y = newY;
    
    elements = elements.map(it => it.id === el.id ? el : it);
    saveState();
    renderCanvas();
    renderProperties();
  });
}

/* ----- Templates ----- */
function applyTemplate(t) {
  gridSize.width = t.width;
  gridSize.height = t.height;
  gridWidthInput.value = gridSize.width;
  gridHeightInput.value = gridSize.height;
  elements = [];
  selectedElement = null;
  saveState();
  renderProperties();
  renderCanvas();
}

/* ----- Export / Import ----- */
async function exportLayout() {
  const data = buildLayoutPayload();

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(shopNameInput.value || 'shop').replace(/\s/g,'_')}_layout.json`;
  a.click();
  URL.revokeObjectURL(url);

  try {
    await saveLayoutToServer(data, false);
  } catch (error) {
    alert('Layout wurde heruntergeladen, aber nicht am Server gespeichert: ' + error.message);
    setSaveStatus(error.message, 'error');
  }
}

function importLayout(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      shopNameInput.value = data.shopName || 'Importierter Shop';
      gridSize = data.gridSize || gridSize;
      gridWidthInput.value = gridSize.width;
      gridHeightInput.value = gridSize.height;
      elements = normalizeImportedElements(data.elements || []);

      recalcMeters();

      selectedElement = null;
      saveState();
      renderProperties();
      renderCanvas();
    } catch (err) {
      alert('Fehler beim Laden der Datei');
      setSaveStatus('Import fehlgeschlagen', 'error');
    }
  };
  reader.readAsText(file);
}

/* ----- Utilities ----- */
// find element by id helper (not strictly necessary)
function findElementById(id) {
  return elements.find(e => e.id === id);
}

function recalcMeters() {
  const categorized = elements.filter(el => el.category !== null);

  const groups = {};

  // 1. Nach Kategorie gruppieren
  categorized.forEach(el => {
    if (!groups[el.category]) {
      groups[el.category] = [];
    }
    groups[el.category].push(el);
  });

  Object.keys(groups).forEach(category => {
    const categoryElements = groups[category];

    // 2. Nach Y (Reihe) gruppieren
    const rows = {};

    categoryElements.forEach(el => {
      const rowKey = el.y; // gleiche Y = gleiche Reihe
      if (!rows[rowKey]) {
        rows[rowKey] = [];
      }
      rows[rowKey].push(el);
    });

    // 3. Reihen sortieren (oben → unten)
    const sortedRowKeys = Object.keys(rows)
      .map(Number)
      .sort((a, b) => a - b);

    let globalMeter = 1;

    // 4. Jede Reihe einzeln behandeln
    sortedRowKeys.forEach(rowY => {
      const row = rows[rowY];

      // innerhalb der Reihe links → rechts sortieren
      row.sort((a, b) => a.x - b.x);

      row.forEach(el => {
        el.meter = globalMeter;
        globalMeter++;
      });
    });
  });
}

/* ----- Kickoff ----- */
initUI();
