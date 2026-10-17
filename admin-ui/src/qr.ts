import qrcode from "qrcode-generator";

/** Quiet zone in modules, as required by the QR specification for scanners. */
export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  size: number;
  isDark(row: number, column: number): boolean;
}

/**
 * Encodes text as a QR matrix with error correction level M (about 15 percent
 * recoverable codewords), which is the print default for stickers on shelves.
 * The encoder is bundled with the admin UI, so no CDN is involved.
 */
export function qrMatrix(text: string): QrMatrix {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  return { size: code.getModuleCount(), isDark: (row, column) => code.isDark(row, column) };
}

/**
 * Renders the matrix as one 1x1 square sub path per dark module, inside a
 * square viewBox of `size` modules that includes the quiet zone.
 */
export function qrSvgPath(text: string, quietZone = QR_QUIET_ZONE): { size: number; path: string } {
  const matrix = qrMatrix(text);
  let path = "";
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.isDark(row, column)) path += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
    }
  }
  return { size: matrix.size + quietZone * 2, path };
}
