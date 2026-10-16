import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ApiClientError, type ApiClient } from "../api/client";
import { calibratedScale, calibrationRotation, prepareUnderlay, type ImagePoint, type LayoutUnderlay } from "./underlay";

interface Props {
  api: ApiClient;
  storeId: string;
  underlay: LayoutUnderlay | null;
  onChange: (value: LayoutUnderlay | null) => void;
}

const value = (raw: string, fallback: number) => raw === "" ? fallback : Number(raw);

export function UnderlayPanel({ api, storeId, underlay, onChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<ImagePoint[]>([]);
  const [meters, setMeters] = useState("");
  const [alignHorizontal, setAlignHorizontal] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const path = `/api/stores/${encodeURIComponent(storeId)}/layout/underlay`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get<LayoutUnderlay>(path, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { onChange(result); setError(null); } })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiClientError && cause.status === 404) onChange(null);
        else setError(cause instanceof Error ? cause.message : "Grundrissbild konnte nicht geladen werden.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, path, onChange]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareUnderlay(file);
      const saved = await api.put<LayoutUnderlay>(path, prepared);
      onChange(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bild konnte nicht hochgeladen werden.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function save(patch: Partial<LayoutUnderlay>): Promise<boolean> {
    if (!underlay) return false;
    setBusy(true);
    setError(null);
    try {
      onChange(await api.put<LayoutUnderlay>(path, patch));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ausrichtung konnte nicht gespeichert werden.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!underlay || !window.confirm("Grundrissbild dieser Filiale entfernen?")) return;
    setBusy(true);
    try {
      await api.delete(path);
      onChange(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Grundrissbild konnte nicht entfernt werden.");
    } finally {
      setBusy(false);
    }
  }

  function choosePoint(event: MouseEvent<HTMLImageElement>) {
    if (!underlay) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left) / bounds.width * underlay.widthPx,
      y: (event.clientY - bounds.top) / bounds.height * underlay.heightPx,
    };
    setPoints((current) => current.length >= 2 ? [point] : [...current, point]);
  }

  async function calibrate() {
    if (points.length !== 2) { setError("Zwei Punkte im Bild auswählen."); return; }
    try {
      const scaleMPerPx = calibratedScale(points[0], points[1], Number(meters));
      if (!await save({ scaleMPerPx, ...(alignHorizontal ? { rotationDeg: -calibrationRotation(points[0], points[1]) } : {}) })) return;
      dialog.current?.close();
      setPoints([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kalibrierung fehlgeschlagen.");
    }
  }

  return <section className="le-underlay-panel" aria-label="Grundrissbild">
    <h2>Grundrissbild</h2>
    <p className="le-hint">PNG/JPEG bis 10 MB. PDF-Seiten zuerst als Bild exportieren. Das Bild bleibt nur im geschützten Filialeditor.</p>
    <input ref={input} type="file" accept="image/png,image/jpeg" aria-label="Grundrissbild auswählen" onChange={(event) => void upload(event.target.files?.[0])} disabled={busy || underlay?.locked} />
    {loading && <p role="status">Grundrissbild wird geladen …</p>}
    {error && <p role="alert" className="le-underlay-error">{error}</p>}
    {!loading && underlay && <div className="le-underlay-controls">
      <p className="le-hint">{underlay.widthPx} × {underlay.heightPx} Pixel · {underlay.scaleMPerPx ? "kalibriert" : "Maßstab fehlt"}</p>
      <button type="button" onClick={() => { setPoints([]); setMeters(""); dialog.current?.showModal(); }} disabled={busy || underlay.locked}>Mit zwei Punkten kalibrieren</button>
      <label>Deckkraft {Math.round(underlay.opacity * 100)} %<input type="range" min="0" max="1" step="0.05" value={underlay.opacity} disabled={busy || underlay.locked} onChange={(event) => onChange({ ...underlay, opacity: Number(event.target.value) })} onPointerUp={() => void save({ opacity: underlay.opacity })} onKeyUp={() => void save({ opacity: underlay.opacity })} /></label>
      <label>X-Versatz (m)<input type="number" step="0.1" value={underlay.offsetXM} disabled={busy || underlay.locked} onChange={(event) => onChange({ ...underlay, offsetXM: value(event.target.value, underlay.offsetXM) })} onBlur={() => void save({ offsetXM: underlay.offsetXM })} /></label>
      <label>Y-Versatz (m)<input type="number" step="0.1" value={underlay.offsetYM} disabled={busy || underlay.locked} onChange={(event) => onChange({ ...underlay, offsetYM: value(event.target.value, underlay.offsetYM) })} onBlur={() => void save({ offsetYM: underlay.offsetYM })} /></label>
      <label>Drehung (°)<input type="number" step="1" value={underlay.rotationDeg} disabled={busy || underlay.locked} onChange={(event) => onChange({ ...underlay, rotationDeg: value(event.target.value, underlay.rotationDeg) })} onBlur={() => void save({ rotationDeg: underlay.rotationDeg })} /></label>
      <label className="le-underlay-lock"><input type="checkbox" checked={underlay.locked} disabled={busy} onChange={(event) => { const locked = event.target.checked; onChange({ ...underlay, locked }); void save({ locked }); }} /> Ausrichtung sperren</label>
      <button type="button" onClick={() => void remove()} disabled={busy || underlay.locked}>Bild entfernen</button>
    </div>}
    <dialog ref={dialog} className="le-underlay-dialog" aria-label="Bild kalibrieren">
      {underlay && <><h3>Bild kalibrieren</h3><p>Zwei Punkte mit bekannter Entfernung im Bild anklicken. Alternativ Koordinaten unten eingeben.</p>
        <div className="le-underlay-preview"><img src={`data:${underlay.contentType};base64,${underlay.imageBase64}`} alt="Grundrissbild für die Kalibrierung" onClick={choosePoint} />{points.map((point, index) => <span key={index} className="le-underlay-marker" style={{ left: `${point.x / underlay.widthPx * 100}%`, top: `${point.y / underlay.heightPx * 100}%` }}>{index + 1}</span>)}</div>
        {error && <p role="alert" className="le-underlay-error">{error}</p>}
        <p role="status">{points.length} von 2 Punkten gewählt</p>
        {[0, 1].map((index) => <div className="le-underlay-point" key={index}><span>Punkt {index + 1}</span><label>X (px)<input type="number" min="0" max={underlay.widthPx} value={points[index]?.x ?? ""} onChange={(event) => setPoints((current) => { const next = [...current]; next[index] = { x: Number(event.target.value), y: next[index]?.y ?? 0 }; return next; })} /></label><label>Y (px)<input type="number" min="0" max={underlay.heightPx} value={points[index]?.y ?? ""} onChange={(event) => setPoints((current) => { const next = [...current]; next[index] = { x: next[index]?.x ?? 0, y: Number(event.target.value) }; return next; })} /></label></div>)}
        <label>Entfernung (m)<input type="number" min="0.001" step="any" value={meters} onChange={(event) => setMeters(event.target.value)} /></label>
        <label><input type="checkbox" checked={alignHorizontal} onChange={(event) => setAlignHorizontal(event.target.checked)} /> Punktlinie horizontal ausrichten</label>
        <div className="le-underlay-dialog-actions"><button type="button" onClick={() => dialog.current?.close()}>Abbrechen</button><button type="button" disabled={busy} onClick={() => void calibrate()}>Maßstab speichern</button></div>
      </>}
    </dialog>
  </section>;
}
