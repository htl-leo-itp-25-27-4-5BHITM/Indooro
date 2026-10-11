const API_BASE = '/api';
const cellSize = 20; // pixels per meter

let layoutData = null;
let categoriesMap = {};
let zoom = 1;
let highlightedElementId = null;

function appendTextElement(parent, className, value) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = String(value ?? '');
  parent.appendChild(element);
  return element;
}

function mapElementById(id) {
  return [...document.querySelectorAll('[data-element-id]')]
    .find(element => element.dataset.elementId === String(id));
}

// Load categories from JSON
async function loadCategories() {
  try {
    const res = await fetch('../assets/data/categories.json');
    const categories = await res.json();
    categoriesMap = {};
    categories.forEach(cat => {
      categoriesMap[cat.categoryCode] = {
        name: cat.categoryName,
        emoji: cat.emoji || '📦',
        color: getCategoryColor(cat.categoryCode)
      };
    });
  } catch (error) {
    console.warn('Categories could not be loaded:', error);
  }
}

function getCategoryColor(code) {
  const colorMap = {
    310: '#4CAF50', 420: '#FF9800', 430: '#FFC107', 440: '#FFE082',
    445: '#FFEB3B', 450: '#FFF59D', 470: '#E91E63', 510: '#2196F3',
    520: '#BBDEFB', 525: '#FFE082', 530: '#B3E5FC', 610: '#795548',
    640: '#00BCD4'
  };
  return colorMap[code] || '#E5E7EB';
}

function getElementCategoryInfo(element) {
  if (!element || !element.category) return null;

  const raw = String(element.category);
  if (raw.includes('/')) {
    const [category, meter] = raw.split('/');
    return {
      categoryCode: category,
      meter: Number.parseInt(meter, 10)
    };
  }

  return {
    categoryCode: raw,
    meter: Number.isFinite(element.meter) ? element.meter : null
  };
}

// Load layout from server first and localStorage as fallback
async function loadLayout() {
  try {
    const response = await fetch(`${API_BASE}/layout/current`);
    if (response.ok) {
      layoutData = await response.json();
      document.getElementById('shopNameDisplay').textContent = layoutData.shopName || 'Indooro';
      return true;
    }
  } catch (error) {
    console.warn('Server layout could not be loaded:', error);
  }

  try {
    const stored = localStorage.getItem('indooro_live_layout');
    if (!stored) {
      showError('Kein Layout gefunden. Bitte erstellen Sie zuerst ein Layout im Admin-Editor.');
      return false;
    }
    layoutData = JSON.parse(stored);
    document.getElementById('shopNameDisplay').textContent = layoutData.shopName || 'Indooro';
    return true;
  } catch (error) {
    showError('Fehler beim Laden des Layouts: ' + error.message);
    return false;
  }
}

// Render the map
function renderMap() {
  if (!layoutData) return;

  const canvas = document.getElementById('mapCanvas');
  const { gridSize, elements } = layoutData;

  const width = gridSize.width * cellSize * zoom;
  const height = gridSize.height * cellSize * zoom;

  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.innerHTML = '';

  // Render each element
  elements.forEach(el => {
    if (el.type === 'beacon') {
      renderBeaconElement(el, canvas);
    } else {
      renderRegularElement(el, canvas);
    }
  });

  updateZoomLabel();
}

function renderBeaconElement(el, canvas) {
  const beaconSize = cellSize * zoom * 0.8; // 80% of cell size

  const div = document.createElement('div');
  div.className = 'map-element beacon';
  div.dataset.elementId = el.id;

  // Position beacon centered on its grid coordinates
  div.style.left = (el.x * cellSize * zoom - beaconSize / 2) + 'px';
  div.style.top = (el.y * cellSize * zoom - beaconSize / 2) + 'px';
  div.style.width = beaconSize + 'px';
  div.style.height = beaconSize + 'px';

  const content = document.createElement('div');
  content.className = 'map-element-content';
  appendTextElement(content, 'beacon-marker', '📡');
  appendTextElement(content, 'beacon-id', el.beaconId || '');

  div.appendChild(content);
  canvas.appendChild(div);
}

function renderRegularElement(el, canvas) {
  const div = document.createElement('div');
  div.className = 'map-element';
  div.dataset.elementId = el.id;

  const elementInfo = getElementCategoryInfo(el);
  const catInfo = elementInfo ? categoriesMap[elementInfo.categoryCode] : null;
  const bgColor = el.color || '#E5E7EB';

  div.style.left = (el.x * cellSize * zoom) + 'px';
  div.style.top = (el.y * cellSize * zoom) + 'px';
  div.style.width = (el.width * cellSize * zoom) + 'px';
  div.style.height = (el.height * cellSize * zoom) + 'px';
  div.style.backgroundColor = bgColor;
  div.style.transform = `rotate(${el.rotation || 0}deg)`;
  div.style.transformOrigin = 'center';

  const content = document.createElement('div');
  content.className = 'map-element-content';

  const icon = catInfo ? catInfo.emoji : '📦';
  const isSmall = el.width < 3 || el.height < 2;

  appendTextElement(content, 'element-icon', icon);
  if (!isSmall) appendTextElement(content, 'element-label', el.label || 'Leer');

  div.appendChild(content);
  canvas.appendChild(div);
}

// Search products
async function searchProducts(query) {
  try {
    const res = await fetch(`${API_BASE}/products/search?q=${encodeURIComponent(query)}&size=50`);
    if (!res.ok) throw new Error('Search failed');
    const products = await res.json();
    return enrichProducts(products);
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

function parseLayoutCode(code) {
  if (typeof code !== 'string') return null;
  const parts = code.split('/');
  if (parts.length !== 4) return null;
  const [cat, meter, fach, reihe] = parts.map(n => Number.parseInt(n, 10));
  if ([cat, meter, fach, reihe].some(n => !Number.isFinite(n))) return null;
  return { cat, meter, fach, reihe };
}

function enrichProducts(products) {
  const out = [];
  for (const p of products) {
    const layout = parseLayoutCode(p.layoutCode);
    if (!layout) continue;
    out.push({
      ...p,
      categoryCode: layout.cat,
      layout
    });
  }
  return out;
}

// Render search results
function renderSearchResults(products) {
  const panel = document.getElementById('search-results-panel');
  panel.innerHTML = '';

  if (products.length === 0) {
    panel.innerHTML = '<div class="empty-message">Keine Produkte gefunden.</div>';
    return;
  }

  const header = document.createElement('div');
  header.className = 'result-header';
  header.textContent = `🔍 ${products.length} Produkt${products.length !== 1 ? 'e' : ''} gefunden`;
  panel.appendChild(header);

  const resultsList = document.createElement('div');
  resultsList.className = 'search-results';

  products.forEach(product => {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    const catInfo = categoriesMap[product.categoryCode] || {
      name: `Kategorie ${product.categoryCode}`,
      emoji: '📦'
    };

    const location = `${catInfo.emoji} ${catInfo.name}`;

    appendTextElement(item, 'product-name', product.name);
    appendTextElement(item, 'product-price', `€${Number(product.price).toFixed(2)}`);
    appendTextElement(item, 'product-location', location);

    item.addEventListener('click', () => highlightProduct(product));

    resultsList.appendChild(item);
  });

  panel.appendChild(resultsList);
}

// Highlight product on map
function highlightProduct(product) {
  clearHighlight();

  if (!layoutData) return;

  const element = layoutData.elements.find(el => {
    const info = getElementCategoryInfo(el);
    if (!info) return false;
    if (String(info.categoryCode) !== String(product.categoryCode)) return false;
    return !product.layout?.meter || !info.meter || product.layout.meter === info.meter;
  });

  if (!element) {
    alert(`Kategorie "${categoriesMap[product.categoryCode]?.name || product.categoryCode}" nicht auf der Karte gefunden.`);
    return;
  }

  const mapElement = mapElementById(element.id);
  if (mapElement) {
    mapElement.classList.add('highlighted');
    highlightedElementId = element.id;

    mapElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
  }
}

function clearHighlight() {
  if (highlightedElementId != null) {
    const prev = mapElementById(highlightedElementId);
    if (prev) prev.classList.remove('highlighted');
    highlightedElementId = null;
  }
}

// Zoom controls
function setZoom(newZoom) {
  zoom = Math.max(0.5, Math.min(2, newZoom));
  renderMap();
}

function updateZoomLabel() {
  document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
}

// Search setup
function setupSearch() {
  const searchInput = document.getElementById('search-input');
  const clearButton = document.getElementById('clear-search');
  let searchTimeout;

  async function performSearch() {
    const query = searchInput.value.trim();

    if (!query) {
      clearButton.style.display = 'none';
      document.getElementById('search-results-panel').innerHTML = `
        <div class="welcome-message">
          <span class="welcome-icon">👉</span>
          <p>Suchen Sie nach einem Produkt, um es auf der Karte zu finden</p>
        </div>
      `;
      clearHighlight();
      return;
    }

    clearButton.style.display = 'inline-block';

    try {
      const results = await searchProducts(query);
      renderSearchResults(results);
    } catch (error) {
      document.getElementById('search-results-panel').innerHTML =
        '<div class="empty-message">Fehler bei der Suche.</div>';
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 300);
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    clearButton.style.display = 'none';
    clearHighlight();
    document.getElementById('search-results-panel').innerHTML = `
      <div class="welcome-message">
        <span class="welcome-icon">👉</span>
        <p>Suchen Sie nach einem Produkt, um es auf der Karte zu finden</p>
      </div>
    `;
  });
}

function showError(message) {
  const panel = document.getElementById('search-results-panel');
  const error = document.createElement('div');
  error.className = 'empty-message';
  error.textContent = `⚠️ ${message}`;
  error.style.color = '#991b1b';
  error.style.background = '#fee2e2';
  error.style.padding = '1.5rem';
  error.style.borderRadius = '8px';
  panel.replaceChildren(error);
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();

  if (await loadLayout()) {
    renderMap();
    setupSearch();

    document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
    document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
  }
});
