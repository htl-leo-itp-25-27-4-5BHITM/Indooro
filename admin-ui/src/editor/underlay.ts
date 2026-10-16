export interface LayoutUnderlay {
  storeId: string;
  contentType: "image/png" | "image/jpeg";
  imageBase64: string;
  widthPx: number;
  heightPx: number;
  scaleMPerPx: number | null;
  offsetXM: number;
  offsetYM: number;
  rotationDeg: number;
  opacity: number;
  locked: boolean;
  updatedAt: string;
}

export interface ImagePoint { x: number; y: number }

export function calibratedScale(first: ImagePoint, second: ImagePoint, meters: number): number {
  const pixels = Math.hypot(second.x - first.x, second.y - first.y);
  if (!Number.isFinite(pixels) || pixels < 1 || !Number.isFinite(meters) || meters <= 0) {
    throw new Error("Zwei verschiedene Bildpunkte und eine positive Entfernung in Metern eingeben.");
  }
  return meters / pixels;
}

export function calibrationRotation(first: ImagePoint, second: ImagePoint): number {
  return Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
}

export async function prepareUnderlay(file: File): Promise<{ contentType: "image/png" | "image/jpeg"; imageBase64: string }> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new Error("Nur PNG oder JPEG hochladen. PDF-Seiten bitte zuerst als Bild exportieren.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Bild ist größer als 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 4000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Bildverarbeitung ist in diesem Browser nicht verfügbar.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Bild konnte nicht verarbeitet werden.")), file.type, 0.88));
    if (blob.size > 10 * 1024 * 1024) throw new Error("Verarbeitetes Bild ist größer als 10 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      reader.readAsDataURL(blob);
    });
    return { contentType: file.type, imageBase64: dataUrl.split(",", 2)[1] };
  } finally {
    bitmap.close();
  }
}
