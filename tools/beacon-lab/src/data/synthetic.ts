/**
 * Deterministic synthetic data generator (see docs/SYNTHETIC_DATA.md).
 *
 * SYNTHETIC DATA ARE NEVER MEASUREMENT RESULTS. Every produced run carries origin "synthetic",
 * provenance.format "synthetic", the full generator config and "SYNTHETISCH" in its name.
 *
 * Model per sample:
 *   RSSI = trueRssiAt1m - 10 * n * log10(max(d, 0.1))      d in metres (layout units * metersPerUnit)
 *          + staticBias(beacon) + scenarioBias(position, time) + N(0, shadowingStd) [+ spike]
 *   quantised to integer dBm (as iOS delivers), clipped to [-105, -30]; values weaker than the receiver
 *   sensitivity (extra.sensitivityDbm, default -100) are not received at all.
 *
 * Determinism: only mulberry32(seed) is used; timestamps/ids are derived from the config, never from the
 * wall clock. Same config + same campaign => byte-identical output.
 */
import { DEFAULT_PATH_LOSS, defaultScale } from "../core/defaults";
import { fnv1aHex, stableStringify } from "../core/hash";
import { gaussian, mulberry32 } from "../core/random";
import type {
  Beacon,
  Campaign,
  MeasurementRun,
  Point,
  ReferencePoint,
  RssiSample,
  RunKind,
  RunRole,
  SyntheticScenarioConfig,
  SyntheticScenarioId,
} from "../core/types";
import { demoFloorPlan } from "./layout";
import { sha256HexSync } from "./sha256sync";

/** Fixed timestamp for all synthetic artefacts so that the output is byte-identical. */
export const SYNTHETIC_TIMESTAMP = "2026-01-01T00:00:00.000Z";
export const SYNTHETIC_DEVICE_ID = "synthetic-device";

export const SCENARIOS: { id: SyntheticScenarioId; title: string; description: string; kind: RunKind }[] = [
  {
    id: "good-coverage",
    title: "Gute Abdeckung",
    description:
      "Stationäre Haltepunkte in den Gängen, alle Beacons aktiv, moderates Rauschen (σ ≈ 3 dB). Referenzfall für Verfahren und Kalibrierung.",
    kind: "stationary",
  },
  {
    id: "poor-coverage",
    title: "Schlechte Abdeckung",
    description:
      "Nur drei weit auseinanderliegende Beacons aktiv, geringe Senderate und hoher Paketverlust. Viele Epochen ohne ausreichend Beacons – zeigt Ausfälle und Lücken.",
    kind: "stationary",
  },
  {
    id: "high-noise",
    title: "Starkes Rauschen",
    description: "Wie „Gute Abdeckung“, aber mit starker Schwankung (σ ≈ 8 dB). Zeigt den Nutzen von RSSI-Filtern.",
    kind: "stationary",
  },
  {
    id: "beacon-dropout",
    title: "Beacon-Ausfall",
    description:
      "Ein Beacon schweigt in einem festen Zeitintervall (dropoutBeaconId, dropoutStart, dropoutEnd). Zeigt Robustheit gegen fehlende Beacons.",
    kind: "stationary",
  },
  {
    id: "aisle-walk",
    title: "Gang-Lauf",
    description:
      "Gehen mit ca. 1,1 m/s entlang einer festen Route durch Seitengang und zwei Gänge; Referenz jede Sekunde. Zeigt Verzögerung und Glättung.",
    kind: "walk",
  },
  {
    id: "jumping-between-beacons",
    title: "Springen zwischen Beacons",
    description:
      "Langsames Hin- und Hergehen zwischen zwei Beacons; deren Vorzeichen-Bias kippt periodisch (starke Mehrwegeausbreitung). Die Schätzung springt – testet temporale Filter.",
    kind: "walk",
  },
  {
    id: "miscalibrated",
    title: "Falsch kalibriert",
    description:
      "Simulation mit RSSI@1 m = −62 dBm und n = 2,0, während das Lab-Standardmodell −72 dBm / 2,8 annimmt. Zeigt den Effekt fehlender Kalibrierung.",
    kind: "stationary",
  },
  {
    id: "multipath",
    title: "Mehrwegeausbreitung",
    description:
      "Gang-Lauf mit ortsabhängigem, glattem Bias pro Beacon (Feld aus Sinusanteilen) und gelegentlichen starken Ausreißern.",
    kind: "walk",
  },
];

type Extra = Record<string, number | string | boolean>;

/** Default seeds so every scenario has a reproducible out-of-the-box dataset. */
const DEFAULT_SEEDS: Record<SyntheticScenarioId, number> = {
  "good-coverage": 1001,
  "poor-coverage": 1002,
  "high-noise": 1003,
  "beacon-dropout": 1004,
  "aisle-walk": 1005,
  "jumping-between-beacons": 1006,
  miscalibrated: 1007,
  multipath: 1008,
};

export function defaultScenarioConfig(id: SyntheticScenarioId, seed?: number): SyntheticScenarioConfig {
  const stationaryExtra: Extra = {
    holdSec: 40,
    transitSec: 5,
    pointCount: 5,
    pointSet: "eval",
    beaconBiasStdDb: 1.5,
    sensitivityDbm: -100,
  };
  const walkExtra: Extra = {
    speedMps: 1.1,
    refIntervalSec: 1,
    beaconBiasStdDb: 1.5,
    sensitivityDbm: -100,
  };
  const base = {
    trueRssiAt1m: -70,
    truePathLossExponent: 2.6,
    shadowingStdDb: 3,
    sampleRateHz: 2,
    packetLossProb: 0.05,
  };
  const s = seed ?? DEFAULT_SEEDS[id];
  switch (id) {
    case "good-coverage":
      return { scenario: id, seed: s, ...base, extra: { ...stationaryExtra } };
    case "poor-coverage":
      return {
        scenario: id,
        seed: s,
        ...base,
        shadowingStdDb: 5,
        sampleRateHz: 1,
        packetLossProb: 0.55,
        extra: { ...stationaryExtra, activeBeaconIds: "LAB-B01,LAB-B07,LAB-B09" },
      };
    case "high-noise":
      return { scenario: id, seed: s, ...base, shadowingStdDb: 8, packetLossProb: 0.1, extra: { ...stationaryExtra } };
    case "beacon-dropout":
      return {
        scenario: id,
        seed: s,
        ...base,
        extra: { ...stationaryExtra, dropoutBeaconId: "LAB-B08", dropoutStart: 60, dropoutEnd: 150 },
      };
    case "aisle-walk":
      return { scenario: id, seed: s, ...base, extra: { ...walkExtra } };
    case "jumping-between-beacons":
      return {
        scenario: id,
        seed: s,
        ...base,
        trueRssiAt1m: -66,
        truePathLossExponent: 2.4,
        shadowingStdDb: 2,
        extra: {
          ...walkExtra,
          speedMps: 0.4,
          durationSec: 60,
          activeBeaconIds: "LAB-B03,LAB-B04",
          toggleBeaconA: "LAB-B03",
          toggleBeaconB: "LAB-B04",
          toggleBiasDb: 9,
          togglePeriodSec: 4,
        },
      };
    case "miscalibrated":
      return {
        scenario: id,
        seed: s,
        ...base,
        trueRssiAt1m: -62,
        truePathLossExponent: 2.0,
        extra: { ...stationaryExtra },
      };
    case "multipath":
      return {
        scenario: id,
        seed: s,
        ...base,
        shadowingStdDb: 2,
        extra: { ...walkExtra, multipathAmplitudeDb: 5, multipathWavelengthUnits: 6, spikeProb: 0.03, spikeDb: 18 },
      };
  }
}

/* ------------------------------------------------------------------ */
/* Geometry shared with the demo market (see layout.ts)                */
/* ------------------------------------------------------------------ */

/** Aisle-centre points (all clear of shelves/checkouts in demoFloorPlan). */
export const EVAL_POINTS: Point[] = [
  { x: 10, y: 5.5 },
  { x: 20, y: 8.5 },
  { x: 24, y: 11.5 },
  { x: 8, y: 14.5 },
  { x: 16, y: 2.4 },
  { x: 22, y: 14.5 },
  { x: 6, y: 8.5 },
  { x: 14, y: 11.5 },
];
export const CAL_POINTS: Point[] = [
  { x: 6, y: 5.5 },
  { x: 14, y: 8.5 },
  { x: 22, y: 5.5 },
  { x: 10, y: 11.5 },
  { x: 18, y: 14.5 },
  { x: 12, y: 2.4 },
  { x: 24, y: 8.5 },
  { x: 20, y: 11.5 },
];
/** Walking route: left side corridor up, along aisle y=8.5 east, right corridor, aisle y=5.5 west. */
export const WALK_ROUTE: Point[] = [
  { x: 1.6, y: 17.5 },
  { x: 1.6, y: 8.5 },
  { x: 27.5, y: 8.5 },
  { x: 27.5, y: 5.5 },
  { x: 4.5, y: 5.5 },
];

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

function getNum(extra: Extra, key: string, fallback: number): number {
  const v = extra[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function getStr(extra: Extra, key: string): string | undefined {
  const v = extra[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

interface Segment {
  start: number;
  end: number;
}

function polylineSampler(route: Point[]): { length: number; at: (s: number) => Point } {
  const cum = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y));
  }
  const length = cum[cum.length - 1];
  return {
    length,
    at(s: number): Point {
      const d = Math.min(Math.max(s, 0), length);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const seg = cum[i] - cum[i - 1];
      const f = seg === 0 ? 0 : (d - cum[i - 1]) / seg;
      return {
        x: route[i - 1].x + (route[i].x - route[i - 1].x) * f,
        y: route[i - 1].y + (route[i].y - route[i - 1].y) * f,
      };
    },
  };
}

interface Timeline {
  kind: RunKind;
  segments: Segment[];
  positionAt: (t: number) => Point;
  references: ReferencePoint[];
}

function buildTimeline(cfg: SyntheticScenarioConfig, mpu: number, kind: RunKind): Timeline {
  const ex = cfg.extra;
  if (kind === "stationary") {
    const holdSec = getNum(ex, "holdSec", 40);
    const transitSec = getNum(ex, "transitSec", 5);
    const set = getStr(ex, "pointSet") === "cal" ? CAL_POINTS : EVAL_POINTS;
    const count = Math.max(1, Math.min(set.length, Math.round(getNum(ex, "pointCount", 5))));
    const points = set.slice(0, count);
    const segments: Segment[] = [];
    const hold: { seg: Segment; p: Point }[] = [];
    const references: ReferencePoint[] = [];
    let cursor = 0;
    points.forEach((p, i) => {
      const seg = { start: cursor, end: cursor + holdSec };
      segments.push(seg);
      hold.push({ seg, p });
      // iOS long-press protocol: truth marked at the start and at the end of the hold
      references.push({ t: round3(seg.start), position: { ...p }, label: `P${i + 1}` });
      references.push({ t: round3(seg.end), position: { ...p }, label: `P${i + 1}` });
      cursor = seg.end + transitSec;
    });
    return {
      kind,
      segments,
      positionAt: (t) => (hold.find((h) => t >= h.seg.start && t <= h.seg.end) ?? hold[hold.length - 1]).p,
      references,
    };
  }

  const refInterval = Math.max(0.1, getNum(ex, "refIntervalSec", 1));
  const speedUnits = getNum(ex, "speedMps", 1.1) / mpu;
  let duration: number;
  let positionAt: (t: number) => Point;
  if (cfg.scenario === "jumping-between-beacons") {
    // back-and-forth in aisle y = 8.5 between x = 12 and x = 18 (centre between the two toggling beacons)
    duration = getNum(ex, "durationSec", 60);
    const x0 = 12;
    const x1 = 18;
    const span = x1 - x0;
    positionAt = (t) => {
      const s = (t * speedUnits) % (2 * span);
      return { x: x0 + (s <= span ? s : 2 * span - s), y: 8.5 };
    };
  } else {
    const path = polylineSampler(WALK_ROUTE);
    duration = path.length / speedUnits;
    positionAt = (t) => path.at(t * speedUnits);
  }
  duration = round3(duration);
  const references: ReferencePoint[] = [];
  for (let k = 0; k * refInterval <= duration + 1e-9; k++) {
    const t = round3(k * refInterval);
    const p = positionAt(t);
    references.push({ t, position: { x: round4(p.x), y: round4(p.y) } });
  }
  return { kind, segments: [{ start: 0, end: duration }], positionAt, references };
}

interface FieldComponent {
  dirX: number;
  dirY: number;
  k: number;
  phase: number;
}

export function generateSyntheticRun(campaign: Campaign, cfg: SyntheticScenarioConfig, role: RunRole): MeasurementRun {
  const meta = SCENARIOS.find((s) => s.id === cfg.scenario);
  if (!meta) throw new Error(`Unbekanntes synthetisches Szenario: ${String(cfg.scenario)}`);
  const ex = cfg.extra;
  const rng = mulberry32(cfg.seed);
  const mpu = campaign.floorPlan.scale?.metersPerUnit ?? defaultScale().metersPerUnit;

  const active = getStr(ex, "activeBeaconIds")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const beacons: Beacon[] = campaign.beacons.filter((b) => b.enabled && (!active || active.includes(b.id)));

  // per-beacon constants, drawn in fixed order from the seeded stream
  const biasStd = getNum(ex, "beaconBiasStdDb", 0);
  const period = 1 / Math.max(cfg.sampleRateHz, 1e-6);
  const amp = getNum(ex, "multipathAmplitudeDb", 0);
  const wavelength = getNum(ex, "multipathWavelengthUnits", 6);
  const perBeacon = beacons.map((b) => {
    const bias = gaussian(rng) * biasStd;
    const phase = rng() * period;
    const comps: FieldComponent[] = [];
    if (amp > 0) {
      for (let c = 0; c < 3; c++) {
        const theta = rng() * 2 * Math.PI;
        const lam = wavelength * (0.7 + 0.6 * rng());
        comps.push({ dirX: Math.cos(theta), dirY: Math.sin(theta), k: (2 * Math.PI) / lam, phase: rng() * 2 * Math.PI });
      }
    }
    return { beacon: b, bias, phase, comps };
  });

  const timeline = buildTimeline(cfg, mpu, meta.kind);
  const total = timeline.segments[timeline.segments.length - 1].end;

  const sens = getNum(ex, "sensitivityDbm", -100);
  const dropId = getStr(ex, "dropoutBeaconId");
  const dropStart = getNum(ex, "dropoutStart", 0);
  const dropEnd = getNum(ex, "dropoutEnd", 0);
  const toggleA = getStr(ex, "toggleBeaconA");
  const toggleB = getStr(ex, "toggleBeaconB");
  const toggleBias = getNum(ex, "toggleBiasDb", 0);
  const togglePeriod = Math.max(0.1, getNum(ex, "togglePeriodSec", 4));
  const spikeProb = getNum(ex, "spikeProb", 0);
  const spikeDb = getNum(ex, "spikeDb", 0);

  const raw: RssiSample[] = [];
  for (const pb of perBeacon) {
    const id = pb.beacon.id;
    let segIdx = 0;
    for (let k = 0; ; k++) {
      const t = pb.phase + k * period;
      if (t > total) break;
      while (segIdx < timeline.segments.length && t > timeline.segments[segIdx].end) segIdx++;
      if (segIdx >= timeline.segments.length) break;
      if (t < timeline.segments[segIdx].start) continue; // transit between holds: no recording
      if (dropId === id && t >= dropStart && t < dropEnd) continue;

      const lost = rng() < cfg.packetLossProb;
      const shadow = gaussian(rng) * cfg.shadowingStdDb;
      const spike = spikeProb > 0 ? (rng() < spikeProb ? (rng() < 0.5 ? -1 : 1) * spikeDb * (0.6 + 0.4 * rng()) : 0) : 0;
      if (lost) continue;

      const pos = timeline.positionAt(t);
      const d = Math.hypot(pos.x - pb.beacon.position.x, pos.y - pb.beacon.position.y) * mpu;
      let value = cfg.trueRssiAt1m - 10 * cfg.truePathLossExponent * Math.log10(Math.max(d, 0.1)) + pb.bias + shadow + spike;
      if (pb.comps.length > 0) {
        let f = 0;
        for (const c of pb.comps) f += Math.sin(c.k * (pos.x * c.dirX + pos.y * c.dirY) + c.phase);
        value += (amp * f) / Math.sqrt(pb.comps.length / 2);
      }
      if (toggleBias !== 0 && (id === toggleA || id === toggleB)) {
        const sign = Math.floor(t / togglePeriod) % 2 === 0 ? 1 : -1;
        value += (id === toggleA ? sign : -sign) * toggleBias;
      }
      if (value < sens) continue; // below receiver sensitivity: not received
      const rssi = Math.min(-30, Math.max(-105, Math.round(value)));
      raw.push({ t: round3(t), beaconId: id, rssi, deviceId: SYNTHETIC_DEVICE_ID, source: "synthetic" });
    }
  }
  const samples = raw.sort((a, b) => a.t - b.t);
  samples.forEach((s, i) => (s.sourceRow = i + 1));

  const config: SyntheticScenarioConfig = { ...cfg, extra: { ...cfg.extra } };
  const configJson = stableStringify(config);
  const rows = samples.length + timeline.references.length;
  return {
    id: `run-syn-${cfg.scenario}-${cfg.seed}-${role}-${fnv1aHex(campaign.id + configJson)}`,
    campaignId: campaign.id,
    name: `SYNTHETISCH: ${meta.title} (Seed ${cfg.seed})`,
    kind: meta.kind,
    role,
    origin: "synthetic",
    deviceId: SYNTHETIC_DEVICE_ID,
    notes:
      "SYNTHETISCHE Daten, vom Lab-Generator erzeugt – KEIN Messergebnis. Szenario: " +
      `${meta.title}. Parameter siehe Provenienz.`,
    createdAt: SYNTHETIC_TIMESTAMP,
    samples,
    references: timeline.references,
    provenance: {
      fileName: `synthetic:${cfg.scenario}:seed-${cfg.seed}`,
      format: "synthetic",
      importedAt: SYNTHETIC_TIMESTAMP,
      sha256: sha256HexSync(configJson),
      totalRows: rows,
      acceptedRows: rows,
      rejectedRows: 0,
      transformations: [
        `Synthetisch erzeugt (Szenario „${meta.title}“, Seed ${cfg.seed}). Die SHA-256-Summe bezieht sich auf die Generator-Konfiguration, nicht auf eine Datei.`,
      ],
      issues: [
        {
          severity: "info",
          code: "synthetic-data",
          message: "SYNTHETISCHE Daten – ausschließlich zum Test der Auswertung, nie als Messergebnis zu verwenden.",
        },
      ],
      synthetic: config,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Demo campaign                                                       */
/* ------------------------------------------------------------------ */

export const DEMO_CAMPAIGN_ID = "campaign-demo-synthetisch";

export function createDemoCampaign(): { campaign: Campaign; runs: MeasurementRun[] } {
  const { plan, beacons } = demoFloorPlan();
  const campaign: Campaign = {
    id: DEMO_CAMPAIGN_ID,
    name: "Demo-Kampagne (SYNTHETISCH)",
    description:
      "Vollständig simulierte Kampagne im fiktiven Demo-Markt. Enthält Kalibrierungs- und Auswertungsläufe. KEINE Messdaten.",
    date: "2026-01-01",
    market: "Fiktiver Demo-Markt (synthetisch)",
    device: "Simulierter Empfänger (synthetisch)",
    conditions: "Simulation: logarithmisches Pfadverlustmodell mit Rauschen, siehe Provenienz der Läufe.",
    notes: "Das Datum ist ein fester Platzhalter. Alle Daten sind synthetisch und reproduzierbar (Seeds in der Provenienz).",
    floorPlan: plan,
    beacons,
    pathLoss: { ...DEFAULT_PATH_LOSS },
    createdAt: SYNTHETIC_TIMESTAMP,
    updatedAt: SYNTHETIC_TIMESTAMP,
  };

  const mk = (id: SyntheticScenarioId, seed: number, role: RunRole, label: string, tweak?: Extra): MeasurementRun => {
    const cfg = defaultScenarioConfig(id, seed);
    if (tweak) cfg.extra = { ...cfg.extra, ...tweak };
    const run = generateSyntheticRun(campaign, cfg, role);
    return { ...run, name: `SYNTHETISCH: ${label}` };
  };

  const runs: MeasurementRun[] = [
    mk("good-coverage", 101, "calibration", "Kalibrierung A (Gute Abdeckung)", { pointSet: "cal", pointCount: 8, holdSec: 30 }),
    mk("good-coverage", 102, "calibration", "Kalibrierung B (Gute Abdeckung)", { pointSet: "cal", pointCount: 8, holdSec: 30 }),
    mk("good-coverage", 201, "evaluation", "Auswertung – Gute Abdeckung"),
    mk("high-noise", 202, "evaluation", "Auswertung – Starkes Rauschen"),
    mk("beacon-dropout", 203, "evaluation", "Auswertung – Beacon-Ausfall"),
    mk("aisle-walk", 204, "evaluation", "Auswertung – Gang-Lauf"),
  ];
  return { campaign, runs };
}
