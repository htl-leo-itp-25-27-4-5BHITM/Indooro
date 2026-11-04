import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { Button } from "./Button";

export interface FileDropProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  children?: ReactNode;
  disabled?: boolean;
}

/** Returns true if the file name has one of the accepted extensions (e.g. ".csv,.json,.jsonl"). */
export function matchesAccept(name: string, accept: string): boolean {
  const exts = accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const lower = name.toLowerCase();
  return exts.length === 0 || exts.some((e) => lower.endsWith(e));
}

export function FileDrop({ onFiles, accept = ".csv,.json,.jsonl", multiple = true, children, disabled }: FileDropProps) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const handle = (list: FileList | File[] | null) => {
    const all = Array.from(list ?? []);
    const ok = all.filter((f) => matchesAccept(f.name, accept));
    setRejected(all.filter((f) => !ok.includes(f)).map((f) => f.name));
    if (ok.length > 0) onFiles(multiple ? ok : ok.slice(0, 1));
  };

  return (
    <div
      data-testid="file-drop"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        over ? "border-teal bg-teal/5" : "border-line bg-white",
        disabled && "opacity-50",
      )}
    >
      <p className="text-sm font-medium text-ink">{children ?? "Dateien hierher ziehen"}</p>
      <p className="text-xs text-muted">Erlaubt: {accept.split(",").join(", ")}</p>
      <input
        id={id}
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        data-testid="file-input"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      <Button variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
        Datei auswählen
      </Button>
      {rejected.length > 0 && (
        <p role="alert" className="text-xs text-danger">
          Nicht unterstützt: {rejected.join(", ")}
        </p>
      )}
    </div>
  );
}
