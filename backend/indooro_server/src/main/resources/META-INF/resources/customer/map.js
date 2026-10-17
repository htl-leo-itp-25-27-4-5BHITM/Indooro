// Inline SVG store map with pan/zoom. All layout text is written via textContent.

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const BUTTON_STEP = 1.4;
const SHELF_LABEL_MIN_FONT = 0.5;

const isObject = (value) => value !== null && typeof value === "object";
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function svgEl(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function geometry(el) {
  const x = num(el.x);
  const y = num(el.y);
  const width = Math.max(num(el.width, 1), 0.05);
  const height = Math.max(num(el.height, 1), 0.05);
  const rotation = num(el.rotation) % 360;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return {
    x,
    y,
    width,
    height,
    cx,
    cy,
    transform: rotation === 0 ? null : `rotate(${rotation} ${cx} ${cy})`
  };
}

function gridDimensions(layout) {
  return {
    width: Math.max(1, Math.floor(num(layout?.gridSize?.width, 1))),
    height: Math.max(1, Math.floor(num(layout?.gridSize?.height, 1)))
  };
}

// Rough glyph-width fit: a label is drawn only when it reads at a useful size.
function fittingFontSize(text, width) {
  const glyphs = Array.from(text).length || 1;
  return Math.min(0.9, (width * 0.9) / (glyphs * 0.55));
}

function shelfNodes(el, geo, highlighted) {
  const label = typeof el.label === "string" ? el.label.trim() : "";
  const common = { transform: geo.transform };
  const nodes = [];

  if (highlighted) {
    nodes.push(
      svgEl("rect", {
        ...common,
        x: geo.x - 0.25,
        y: geo.y - 0.25,
        width: geo.width + 0.5,
        height: geo.height + 0.5,
        class: "shelf-pulse"
      })
    );
  }

  const rect = svgEl("rect", {
    ...common,
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
    class: highlighted ? "shelf shelf--highlight" : "shelf",
    "data-testid": el.id !== undefined && el.id !== null ? `shelf-${el.id}` : undefined
  });
  rect.appendChild(svgEl("title", {}, label || "Regal"));
  nodes.push(rect);

  if (label) {
    const size = fittingFontSize(label, geo.width);
    if (size >= SHELF_LABEL_MIN_FONT) {
      nodes.push(
        svgEl(
          "text",
          {
            ...common,
            x: geo.cx,
            y: geo.cy,
            class: "shelf-label",
            "text-anchor": "middle",
            "dominant-baseline": "central",
            "font-size": size.toFixed(2)
          },
          label
        )
      );
    }
  }
  return nodes;
}

function otherNodes(el, geo) {
  const nodes = [];
  if (el.type === "wall") {
    const rect = svgEl("rect", { x: geo.x, y: geo.y, width: geo.width, height: geo.height, transform: geo.transform, class: "wall" });
    rect.appendChild(svgEl("title", {}, "Wand"));
    nodes.push(rect);
    return nodes;
  }
  const tooltip = (typeof el.label === "string" && el.label.trim()) || (typeof el.type === "string" ? el.type : "Element");
  const rect = svgEl("rect", {
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
    transform: geo.transform,
    class: "element element--muted"
  });
  rect.appendChild(svgEl("title", {}, tooltip));
  nodes.push(rect);
  return nodes;
}

function entranceNodes(el, geo) {
  const rect = svgEl("rect", { x: geo.x, y: geo.y, width: geo.width, height: geo.height, transform: geo.transform, class: "entrance" });
  rect.appendChild(svgEl("title", {}, "Eingang"));
  return [
    rect,
    svgEl("text", { x: geo.cx, y: geo.cy, class: "entrance-label", "text-anchor": "middle", "dominant-baseline": "central", "font-size": 0.5 }, "Eingang")
  ];
}

function anchorNodes(el, geo) {
  const anchorId = typeof el.anchorId === "string" || typeof el.anchorId === "number" ? String(el.anchorId) : "";
  const dot = svgEl("circle", { cx: geo.cx, cy: geo.cy, r: 0.3, class: "anchor-dot" });
  dot.appendChild(svgEl("title", {}, anchorId ? `Anker ${anchorId}` : "Anker"));
  const nodes = [dot];
  if (anchorId) {
    nodes.push(svgEl("text", { x: geo.cx, y: geo.cy - 0.7, class: "anchor-label", "text-anchor": "middle", "font-size": 0.55 }, anchorId));
  }
  return nodes;
}

function routeNode(points) {
  return svgEl("polyline", {
    class: "route-line",
    fill: "none",
    points: points.map((point) => `${point.x},${point.y}`).join(" "),
    "data-testid": "route"
  });
}

function startMarker(point) {
  const group = svgEl("g", { class: "start-marker", "data-testid": "start-marker" });
  group.append(
    svgEl("circle", { cx: point.x, cy: point.y, r: 0.9, class: "start-halo" }),
    svgEl("circle", { cx: point.x, cy: point.y, r: 0.4, class: "start-dot" }),
    svgEl("text", { x: point.x, y: point.y - 1.1, class: "start-label", "text-anchor": "middle", "font-size": 0.6 }, "Sie sind hier")
  );
  return group;
}

function buildSvg(layout, scene) {
  const { width, height } = gridDimensions(layout);
  const svg = svgEl("svg", {
    class: "map-svg",
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "Ladenplan",
    "data-testid": "map"
  });

  const elements = (Array.isArray(layout.elements) ? layout.elements : []).filter(isObject);
  const base = [];
  const shelves = [];
  const markers = [];
  for (const el of elements) {
    const geo = geometry(el);
    if (el.type === "shelf") shelves.push(...shelfNodes(el, geo, el === scene.highlight));
    else if (el.type === "entrance") markers.push(...entranceNodes(el, geo));
    else if (el.type === "anchor") markers.push(...anchorNodes(el, geo));
    else base.push(...otherNodes(el, geo));
  }
  svg.append(...base, ...shelves, ...markers);

  if (Array.isArray(scene.route) && scene.route.length >= 2) svg.append(routeNode(scene.route));
  if (scene.start) svg.append(startMarker(scene.start));
  return svg;
}

export function shelfCenter(el) {
  const geo = geometry(el);
  return { x: geo.cx, y: geo.cy };
}

export function createMap({ viewport, stage, zoomLabel, zoomIn, zoomOut, zoomReset }) {
  let currentLayout = null;
  let dims = { width: 1, height: 1 };
  let scale = MIN_SCALE;
  let tx = 0;
  let ty = 0;
  const pointers = new Map();
  let pinchDistance = 0;

  const viewportSize = () => ({ w: viewport.clientWidth, h: viewport.clientHeight });

  function clampPan() {
    const { w, h } = viewportSize();
    if (scale <= MIN_SCALE) {
      tx = 0;
      ty = 0;
      return;
    }
    tx = Math.min(0, Math.max(w - w * scale, tx));
    ty = Math.min(0, Math.max(h - h * scale, ty));
  }

  function apply() {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)} %`;
    zoomOut.disabled = scale <= MIN_SCALE;
    zoomIn.disabled = scale >= MAX_SCALE;
  }

  // (px, py) are viewport-relative pixels that stay fixed while zooming.
  function zoomAt(px, py, requested) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, requested));
    const ratio = next / scale;
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = next;
    clampPan();
    apply();
  }

  function reset() {
    scale = MIN_SCALE;
    tx = 0;
    ty = 0;
    apply();
  }

  function centerOn(point, minScale) {
    const { w, h } = viewportSize();
    scale = Math.min(MAX_SCALE, Math.max(scale, minScale));
    const px = (point.x / dims.width) * w;
    const py = (point.y / dims.height) * h;
    tx = w / 2 - px * scale;
    ty = h / 2 - py * scale;
    clampPan();
    apply();
  }

  function setScene(scene) {
    const layout = scene.layout;
    if (layout !== currentLayout) {
      currentLayout = layout;
      dims = gridDimensions(layout);
      viewport.style.aspectRatio = `${dims.width} / ${dims.height}`;
      scale = MIN_SCALE;
      tx = 0;
      ty = 0;
    }
    stage.replaceChildren(buildSvg(layout, scene));
    if (scene.focus && scene.highlight) {
      centerOn(shelfCenter(scene.highlight), 2);
    } else {
      clampPan();
      apply();
    }
  }

  zoomIn.addEventListener("click", () => {
    const { w, h } = viewportSize();
    zoomAt(w / 2, h / 2, scale * BUTTON_STEP);
  });
  zoomOut.addEventListener("click", () => {
    const { w, h } = viewportSize();
    zoomAt(w / 2, h / 2, scale / BUTTON_STEP);
  });
  zoomReset.addEventListener("click", reset);

  viewport.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best effort; movement still works inside the viewport.
    }
    pinchDistance = 0;
  });

  viewport.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, current);

    if (pointers.size === 1) {
      if (scale > MIN_SCALE) {
        tx += current.x - previous.x;
        ty += current.y - previous.y;
        clampPan();
        apply();
      }
      return;
    }

    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance > 0 && distance > 0) {
      const rect = viewport.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      zoomAt(midX, midY, scale * (distance / pinchDistance));
    }
    pinchDistance = distance;
  });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
  };
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);

  // Desktop wheel zoom; at 1x the page keeps scrolling when scrolling down over the map.
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (scale === MIN_SCALE && event.deltaY > 0) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, scale * Math.exp(-event.deltaY * 0.0015));
    },
    { passive: false }
  );

  window.addEventListener("resize", () => {
    clampPan();
    apply();
  });

  apply();
  return { setScene, reset };
}
