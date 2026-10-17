const EPSILON = 1e-9;
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

const keyOf = (x, y) => `${x},${y}`;
const parseKey = (key) => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};

function normalizedAngle(rotation) {
  const degrees = Number(rotation) || 0;
  return ((degrees % 360) + 360) % 360;
}

export function centerOf(el) {
  return {
    x: Number(el.x) + (Number(el.width) || 1) / 2,
    y: Number(el.y) + (Number(el.height) || 1) / 2
  };
}

// Cells whose centre lies inside the element rectangle, rotated clockwise
// (SVG convention, y down) about the rectangle centre.
export function rectCells(el) {
  const x = Number(el.x);
  const y = Number(el.y);
  const w = Number(el.width) || 1;
  const h = Number(el.height) || 1;
  const cells = new Set();
  const angle = normalizedAngle(el.rotation);

  if (angle === 0) {
    for (let j = Math.floor(y); j < Math.ceil(y + h); j += 1) {
      for (let i = Math.floor(x); i < Math.ceil(x + w); i += 1) cells.add(keyOf(i, j));
    }
    return cells;
  }

  const cx = x + w / 2;
  const cy = y + h / 2;
  const reach = Math.hypot(w / 2, h / 2);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let j = Math.floor(cy - reach); j <= Math.ceil(cy + reach); j += 1) {
    for (let i = Math.floor(cx - reach); i <= Math.ceil(cx + reach); i += 1) {
      const u = i + 0.5 - cx;
      const v = j + 0.5 - cy;
      // Inverse rotation into the element's local frame.
      const localU = u * cos + v * sin;
      const localV = -u * sin + v * cos;
      if (Math.abs(localU) <= w / 2 + EPSILON && Math.abs(localV) <= h / 2 + EPSILON) {
        cells.add(keyOf(i, j));
      }
    }
  }
  return cells;
}

export function buildGrid(layout) {
  const width = Math.max(0, Math.floor(Number(layout?.gridSize?.width) || 0));
  const height = Math.max(0, Math.floor(Number(layout?.gridSize?.height) || 0));
  const blocked = new Set();
  const elements = Array.isArray(layout?.elements) ? layout.elements : [];
  for (const el of elements) {
    if (el?.type !== "shelf" && el?.type !== "wall") continue;
    for (const key of rectCells(el)) {
      const { x, y } = parseKey(key);
      if (x >= 0 && y >= 0 && x < width && y < height) blocked.add(key);
    }
  }
  return { width, height, blocked };
}

export function isWalkable(grid, x, y) {
  return (
    Boolean(grid) &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < grid.width &&
    y < grid.height &&
    !grid.blocked?.has(keyOf(x, y))
  );
}

export function entrancePoint(elements) {
  const el = (Array.isArray(elements) ? elements : []).find((e) => e?.type === "entrance");
  return el ? centerOf(el) : null;
}

export function anchorPoint(elements, anchorId) {
  const wanted = String(anchorId ?? "").toLowerCase();
  if (!wanted) return null;
  const el = (Array.isArray(elements) ? elements : []).find(
    (e) => e?.type === "anchor" && String(e.anchorId ?? "").toLowerCase() === wanted
  );
  return el ? centerOf(el) : null;
}

// Walkable 4-neighbour cell next to the shelf that is closest to the shelf centre.
export function accessCell(grid, shelfEl) {
  if (!shelfEl) return null;
  const covered = rectCells(shelfEl);
  const center = centerOf(shelfEl);
  let best = null;
  let bestDistance = Infinity;
  for (const key of covered) {
    const { x, y } = parseKey(key);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (covered.has(keyOf(nx, ny)) || !isWalkable(grid, nx, ny)) continue;
      const distance = Math.hypot(nx + 0.5 - center.x, ny + 0.5 - center.y);
      if (distance < bestDistance) {
        best = { x: nx, y: ny };
        bestDistance = distance;
      }
    }
  }
  return best;
}

// Clamp a point to the grid, then search outward (BFS) for the nearest walkable cell.
export function cellOf(point, grid) {
  if (!grid || grid.width < 1 || grid.height < 1 || !point) return null;
  const px = Number(point.x);
  const py = Number(point.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

  const startX = Math.min(Math.max(Math.floor(px), 0), grid.width - 1);
  const startY = Math.min(Math.max(Math.floor(py), 0), grid.height - 1);
  const seen = new Set([keyOf(startX, startY)]);
  const queue = [{ x: startX, y: startY }];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    if (isWalkable(grid, cell.x, cell.y)) return { x: cell.x, y: cell.y };
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const key = keyOf(nx, ny);
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
