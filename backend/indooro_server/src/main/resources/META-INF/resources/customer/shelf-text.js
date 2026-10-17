export const NOT_IN_TEST_AREA = "Nicht im Testbereich – bitte Personal fragen";

const INTEGER = /^[+-]?\d+$/;

// A shelf matches when its category "<base>/<meter>" equals the first two
// parts of the layout code. Only shelf.category is inspected.
export function matchesLayoutCode(shelf, layoutCode) {
  if (typeof shelf?.category !== "string" || typeof layoutCode !== "string") return false;
  const category = shelf.category.split("/");
  if (category.length !== 2 || category[0] === "" || category[1] === "") return false;
  const parts = layoutCode.split("/");
  return parts.length >= 2 && parts[0] === category[0] && parts[1] === category[1];
}

export function findShelf(layoutCode, elements) {
  if (!Array.isArray(elements)) return null;
  return elements.find((el) => el?.type === "shelf" && matchesLayoutCode(el, layoutCode)) ?? null;
}

// Customer-facing text for a layout code "<base>/<meter>/<fach>/<reihe>".
// Returns null when the code or shelf does not allow a sensible description.
export function describe(layoutCode, shelf) {
  if (!shelf || typeof layoutCode !== "string") return null;
  const parts = layoutCode.split("/");
  if (parts.length < 2 || parts[0] === "" || !INTEGER.test(parts[1])) return null;

  const label = typeof shelf.label === "string" ? shelf.label.trim() : "";
  const primary = label || `Regal ${parts[1]}`;

  let detail = null;
  if (parts.length >= 4 && INTEGER.test(parts[2]) && INTEGER.test(parts[3])) {
    detail = `${Number(parts[2])}. Boden von unten · Position ${Number(parts[3])}`;
  }
  return { primary, detail, debugCode: layoutCode };
}

export function describeProduct(layoutCode, elements) {
  return describe(layoutCode, findShelf(layoutCode, elements));
}
