import { useMemo, useRef } from "react";
import { Button } from "../ui/components/Button";
import { Callout } from "../ui/components/Callout";
import { buildResultsJson } from "./exports";
import { renderReportHtml } from "./renderHtml";
import { buildReportModel } from "./reportModel";
import type { ReportInput } from "./reportModel";

export interface DownloadPayload {
  fileName: string;
  mime: string;
  content: string;
}

export interface ReportPreviewProps {
  input: ReportInput;
  /** Called instead of the browser download – lets tests (and the host app) intercept the files. */
  onDownload?: (file: DownloadPayload) => void;
}

function browserDownload(file: DownloadPayload) {
  const blob = new Blob([file.content], { type: `${file.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bericht";
}

/**
 * Shows the generated report in a sandboxed iframe. PDF export = browser print dialog ("Als PDF speichern")
 * on the print-optimised HTML – no extra dependency, identical output to what the preview shows.
 */
export function ReportPreview({ input, onDownload = browserDownload }: ReportPreviewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const model = useMemo(() => buildReportModel(input), [input]);
  const html = useMemo(() => renderReportHtml(model), [model]);
  const base = `messbericht-${slug(input.campaign.name)}${model.hasSynthetic ? "-SYNTHETISCH" : ""}-${input.generatedAt.slice(0, 10)}`;

  const print = () => {
    const w = frame.current?.contentWindow;
    w?.focus();
    w?.print();
  };

  return (
    <div className="space-y-3">
      {model.hasSynthetic && (
        <Callout tone="synthetic" title="Enthält synthetische Daten – keine Messergebnisse">
          Der Bericht trägt auf jeder Seite einen entsprechenden Hinweis.
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={print}>
          Drucken / als PDF speichern
        </Button>
        <Button onClick={() => onDownload({ fileName: `${base}.html`, mime: "text/html", content: html })}>HTML herunterladen</Button>
        <Button onClick={() => onDownload({ fileName: `${base}-ergebnisse.json`, mime: "application/json", content: buildResultsJson(input) })}>JSON-Ergebnisse herunterladen</Button>
      </div>
      <iframe
        ref={frame}
        title="Berichtsvorschau"
        sandbox="allow-same-origin allow-modals"
        srcDoc={html}
        className="h-[70vh] w-full rounded-xl border border-line bg-white"
      />
    </div>
  );
}
