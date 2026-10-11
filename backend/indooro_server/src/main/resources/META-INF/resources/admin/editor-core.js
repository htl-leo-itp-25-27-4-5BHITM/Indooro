export function validateLayoutDocument(layout = {}, context = {}) {
  const elements = Array.isArray(layout.elements) ? layout.elements : [];
  const width = Number(layout.width || layout.mapWidth || layout.gridSize?.width || 1200);
  const height = Number(layout.height || layout.mapHeight || layout.gridSize?.height || 800);
  const gridWidth = Number(layout.gridSize?.width || layout.gridWidth || 0);
  const gridHeight = Number(layout.gridSize?.height || layout.gridHeight || 0);
  const placedBeaconIds = new Map();
  const issues = [];

  if (!layout.shopName) {
    issues.push({ severity: "warning", message: "Shop-Name fehlt.", elementId: null });
  }
  if (!gridWidth || !gridHeight) {
    issues.push({ severity: "warning", message: "Grid-Groesse fehlt.", elementId: null });
  }
  if (!elements.length) {
    issues.push({ severity: "error", message: "Layout enthaelt keine Elemente.", elementId: null });
  }
  if (!elements.some((element) => element.type === "entrance")) {
    issues.push({ severity: "warning", message: "Kein Eingang platziert.", elementId: null });
  }

  for (const element of elements) {
    const id = element.id ?? element.label ?? "unbenannt";
    const x = Number(element.x ?? 0);
    const y = Number(element.y ?? 0);
    const elementWidth = Number(element.width ?? element.w ?? (element.type === "beacon" ? 0 : 1));
    const elementHeight = Number(element.height ?? element.h ?? (element.type === "beacon" ? 0 : 1));
    const pointElement = element.type === "beacon";
    const outsidePoint = pointElement && (x < 0 || y < 0 || x > width || y > height);
    const outsideBox = !pointElement && (x < 0 || y < 0 || x + elementWidth > width || y + elementHeight > height);
    if (outsidePoint || outsideBox) {
      issues.push({ severity: "error", message: `${labelForElement(element)} liegt ausserhalb der Flaeche.`, elementId: id });
    }
    if ((element.type === "shelf" || element.type === "poi") && !element.category && !element.layoutCode) {
      issues.push({ severity: "warning", message: `${labelForElement(element)} hat keine Kategorie/Layout-Metadaten.`, elementId: id });
    }
    const beaconId = element.beaconId || element.beaconCode || element.beaconIdentity;
    if (element.type === "beacon" && !beaconId) {
      issues.push({ severity: "error", message: `${labelForElement(element)} ist keinem Beacon zugeordnet.`, elementId: id });
    }
    if (element.type === "beacon" && beaconId) {
      if (placedBeaconIds.has(beaconId)) {
        issues.push({ severity: "error", message: `Beacon ${beaconId} ist mehrfach platziert.`, elementId: id });
      }
      placedBeaconIds.set(beaconId, id);
    }
  }

  const assigned = Array.isArray(context.assignedBeacons) ? context.assignedBeacons : [];
  for (const beacon of assigned) {
    const beaconId = beacon.id || beacon.beaconCode || beacon.identityKey;
    if (beaconId && !placedBeaconIds.has(beaconId)) {
      issues.push({ severity: "warning", message: `Zugewiesener Beacon ${beacon.beaconCode || beaconId} ist nicht platziert.`, elementId: null });
    }
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    readyToPublish: !issues.some((issue) => issue.severity === "error")
  };
}

export function labelForElement(element = {}) {
  return element.label || element.name || element.type || "Element";
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function snapValue(value, gridSize = 10, enabled = true) {
  if (!enabled) return Number(value) || 0;
  const grid = Math.max(1, Number(gridSize) || 10);
  return Math.round((Number(value) || 0) / grid) * grid;
}

export function clampElement(element = {}, bounds = {}) {
  const width = Number(bounds.width || 1200);
  const height = Number(bounds.height || 800);
  const elementWidth = Number(element.width ?? element.w ?? 1);
  const elementHeight = Number(element.height ?? element.h ?? 1);
  return {
    ...element,
    x: Math.min(Math.max(0, Number(element.x) || 0), Math.max(0, width - elementWidth)),
    y: Math.min(Math.max(0, Number(element.y) || 0), Math.max(0, height - elementHeight))
  };
}

export function createHistory(initialState) {
  return {
    past: [],
    present: initialState,
    future: []
  };
}

export function pushHistory(history, nextState) {
  return {
    past: [...history.past, history.present].slice(-50),
    present: nextState,
    future: []
  };
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  const previous = history.past.at(-1);
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present].slice(-50),
    present: next,
    future: history.future.slice(1)
  };
}
