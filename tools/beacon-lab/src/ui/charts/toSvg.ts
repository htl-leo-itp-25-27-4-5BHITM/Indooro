import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * Serialises a chart element to a standalone SVG string (for the report's figures).
 * Pass an explicit `width` prop on the chart so the size does not depend on the DOM.
 */
export function chartToSvgString(chart: ReactElement): string {
  const html = renderToStaticMarkup(chart);
  const m = html.match(/<svg[\s\S]*<\/svg>/);
  return m ? m[0] : "";
}
