/**
 * Thrown when a data-leakage rule is violated (calibration data used for evaluation or the reverse).
 * This is the ONLY error the positioning module throws on purpose; everything else returns failures.
 * Re-exported from `pipeline.ts` (contract: `export class LeakageError`).
 */
export class LeakageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeakageError";
  }
}
