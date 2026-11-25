import { useState } from "react";

/** Keeps start and end: ids of one batch often differ only at the end (beacon major and minor). */
export function shortenId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 6)}…${value.slice(-12)}` : value;
}

/** A long technical id: shortened on screen, complete in the tooltip and through the copy button. */
export function CopyableId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Without clipboard access the tooltip still shows the complete value.
      setCopied(false);
    }
  }

  return <span className="copy-id">
    <code title={value}>{shortenId(value)}</code>
    <button type="button" className="copy-id-button" aria-label={`${label} kopieren`} title={`${label} kopieren`} onClick={() => void copy()}>{copied ? "✓" : "⧉"}</button>
    <span className="visually-hidden" aria-live="polite">{copied ? "Kopiert" : ""}</span>
  </span>;
}
