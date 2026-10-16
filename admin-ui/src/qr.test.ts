import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from "./qr.ts";

const payload = "https://example.org/customer/?store=SPAR-Leonding-001&a=A12";
const scale = 4;

/** Rasterizes dark modules to opaque RGBA pixels, scaled, with the quiet zone included. */
function raster(size: number, isDark: (row: number, column: number) => boolean) {
  const pixels = size * scale;
  const data = new Uint8ClampedArray(pixels * pixels * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!isDark(row, column)) continue;
      for (let y = row * scale; y < (row + 1) * scale; y++) {
        for (let x = column * scale; x < (column + 1) * scale; x++) {
          const offset = (y * pixels + x) * 4;
          data[offset] = data[offset + 1] = data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, width: pixels, height: pixels };
}

test("encoded anchor payload decodes to the identical URL with a quiet zone", () => {
  const matrix = qrMatrix(payload);
  assert.ok(matrix.size >= 21, "version 1 or larger matrix");
  const image = raster(matrix.size + QR_QUIET_ZONE * 2, (row, column) => {
    const moduleRow = row - QR_QUIET_ZONE;
    const moduleColumn = column - QR_QUIET_ZONE;
    return moduleRow >= 0 && moduleColumn >= 0 && moduleRow < matrix.size && moduleColumn < matrix.size
      && matrix.isDark(moduleRow, moduleColumn);
  });
  const decoded = jsQR(image.data, image.width, image.height);
  assert.equal(decoded?.data, payload);
});

test("SVG path output decodes to the same payload as the matrix", () => {
  const { size, path } = qrSvgPath(payload);
  const dark = new Set<string>();
  for (const [, column, row] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) dark.add(`${row},${column}`);
  assert.ok(dark.size > 0);
  const image = raster(size, (row, column) => dark.has(`${row},${column}`));
  assert.equal(jsQR(image.data, image.width, image.height)?.data, payload);
});
