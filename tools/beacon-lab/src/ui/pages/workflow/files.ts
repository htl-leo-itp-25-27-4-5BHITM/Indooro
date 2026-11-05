/** Reads a File as text (FileReader fallback for environments without Blob.text, e.g. jsdom). */
export function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("Datei konnte nicht gelesen werden."));
    r.readAsText(file);
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fileSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "datei";
}
