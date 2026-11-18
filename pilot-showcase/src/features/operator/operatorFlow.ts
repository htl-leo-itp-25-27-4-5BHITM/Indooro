import { evaluateReadiness, type FindingCode, type ReadinessReport } from "./evaluateReadiness";
import { createInitialState, EXTRA_SNACK_PRODUCTS, type SimMarket, type SimState } from "./simModel";

/** Reiner Zustandsautomat für die geführte Betreiber-Simulation (7 Schritte, 0-basiert). */
export const STEP_COUNT = 7;

export type FixCode = Extract<FindingCode, "BEACON_MAJOR_MINOR_MISSING" | "PRODUCT_NO_SHELF" | "SHELF_WITHOUT_PRODUCTS">;
export const FIX_ORDER: FixCode[] = ["BEACON_MAJOR_MINOR_MISSING", "PRODUCT_NO_SHELF", "SHELF_WITHOUT_PRODUCTS"];

export interface FixInfo {
  code: FixCode;
  button: string;
  /** Was die Betreiberin im echten Admin tun würde. */
  realWorld: string;
}

export const FIXES: Record<FixCode, FixInfo> = {
  BEACON_MAJOR_MINOR_MISSING: {
    code: "BEACON_MAJOR_MINOR_MISSING",
    button: "Major und Minor eintragen",
    realWorld: "Admin › Beacons: Werte mit der App nRF Connect am Beacon auslesen und in der Beacon-Verwaltung eintragen."
  },
  PRODUCT_NO_SHELF: {
    code: "PRODUCT_NO_SHELF",
    button: "Regal-Code korrigieren",
    realWorld: "Regal im Layout-Editor anlegen oder den Regal-Code in der CSV berichtigen und erneut importieren."
  },
  SHELF_WITHOUT_PRODUCTS: {
    code: "SHELF_WITHOUT_PRODUCTS",
    button: "Produkte ergänzen",
    realWorld: "Prüfen, ob die CSV das Regal vergessen hat, und Produkte ergänzen. Eine Warnung darf auch bleiben."
  }
};

export interface FlowState {
  step: number;
  created: boolean;
  imported: boolean;
  checked: boolean;
  autoplay: boolean;
  applied: FixCode[];
  sim: SimState;
}

export type FlowAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; step: number }
  | { type: "create"; market?: Partial<SimMarket> }
  | { type: "importCsv" }
  | { type: "runCheck" }
  | { type: "fix"; code: FixCode }
  | { type: "setAutoplay"; on: boolean }
  | { type: "reset" };

export function createFlow(): FlowState {
  return { step: 0, created: false, imported: false, checked: false, autoplay: false, applied: [], sim: createInitialState() };
}

/** Aktuelle Bereitschaft, solange das Sortiment importiert ist; sonst ohne Produkte. */
export function currentReport(state: FlowState): ReadinessReport {
  return evaluateReadiness(state.imported ? state.sim : { ...state.sim, products: [] });
}

/** Darf der Schritt `step` verlassen werden (nach vorne)? */
export function canLeave(state: FlowState, step: number): boolean {
  switch (step) {
    case 0:
      return state.created;
    case 3:
      return state.imported;
    case 4:
      return state.checked;
    case 5:
      return state.checked && currentReport(state).blocking === 0;
    default:
      return step < STEP_COUNT - 1;
  }
}

/** Höchster Schritt, der über Stepper-Klicks erreichbar ist. */
export function maxReachable(state: FlowState): number {
  for (let i = 0; i < STEP_COUNT - 1; i++) if (!canLeave(state, i)) return i;
  return STEP_COUNT - 1;
}

export function canNext(state: FlowState): boolean {
  return state.step < STEP_COUNT - 1 && canLeave(state, state.step);
}

export function applyFix(sim: SimState, code: FixCode): SimState {
  switch (code) {
    case "BEACON_MAJOR_MINOR_MISSING":
      return { ...sim, beacons: sim.beacons.map((b) => (b.major === null || b.minor === null ? { ...b, major: b.major ?? 10, minor: b.minor ?? 3 } : b)) };
    case "PRODUCT_NO_SHELF":
      return {
        ...sim,
        products: sim.products.map((p) => (sim.shelves.some((s) => s.category === p.layoutCode) ? p : { ...p, layoutCode: "220/1" }))
      };
    case "SHELF_WITHOUT_PRODUCTS":
      return { ...sim, products: [...sim.products, ...EXTRA_SNACK_PRODUCTS.filter((e) => !sim.products.some((p) => p.id === e.id))] };
  }
}

/** Sind für diesen Fix noch Befunde offen? */
export function fixAvailable(state: FlowState, code: FixCode): boolean {
  return state.checked && currentReport(state).findings.some((f) => f.code === code);
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "next":
      return canNext(state) ? { ...state, step: state.step + 1 } : state;
    case "prev":
      return state.step > 0 ? { ...state, step: state.step - 1 } : state;
    case "goto": {
      const target = Math.max(0, Math.min(STEP_COUNT - 1, action.step));
      return target <= maxReachable(state) ? { ...state, step: target } : state;
    }
    case "create":
      return { ...state, created: true, sim: { ...state.sim, market: { ...state.sim.market, ...action.market } } };
    case "importCsv":
      return { ...state, imported: true };
    case "runCheck":
      return state.imported ? { ...state, checked: true } : state;
    case "fix": {
      if (!fixAvailable(state, action.code)) return state;
      return { ...state, sim: applyFix(state.sim, action.code), applied: [...state.applied, action.code] };
    }
    case "setAutoplay":
      return { ...state, autoplay: action.on };
    case "reset":
      return { ...createFlow(), autoplay: false };
  }
}

/**
 * Nächste Aktion für den automatischen Ablauf. Pro Aufruf genau ein Schritt der Geschichte:
 * erst die nötige Handlung des aktuellen Schritts, dann „next“. Am Ende `null`.
 */
export function autoplayAction(state: FlowState): FlowAction | null {
  if (!state.created) return { type: "create" };
  if (state.step === 3 && !state.imported) return { type: "importCsv" };
  if (state.step === 4 && !state.checked) return { type: "runCheck" };
  if (state.step === 5) {
    const open = FIX_ORDER.find((c) => fixAvailable(state, c));
    if (open) return { type: "fix", code: open };
  }
  if (canNext(state)) return { type: "next" };
  return null;
}
