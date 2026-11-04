import { useMemo, useState } from "react";
import type { RunRole, SyntheticScenarioId } from "../../../core/types";
import { SCENARIOS, defaultScenarioConfig, generateSyntheticRun } from "../../../data/synthetic";
import { Badge, Button, Callout, Card, Field, NumberInput, Select } from "../../components";
import { useCampaign } from "../../state/LabContext";

export function SyntheticGenerator() {
  const { campaign, saveRun } = useCampaign();
  const [scenario, setScenario] = useState<SyntheticScenarioId>("good-coverage");
  const base = useMemo(() => defaultScenarioConfig(scenario), [scenario]);
  const [seed, setSeed] = useState<number | null>(null);
  const [role, setRole] = useState<RunRole>("evaluation");
  const [sigma, setSigma] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [loss, setLoss] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const meta = SCENARIOS.find((s) => s.id === scenario)!;

  const pick = (id: SyntheticScenarioId) => {
    setScenario(id);
    setSeed(null);
    setSigma(null);
    setRate(null);
    setLoss(null);
  };

  const generate = async () => {
    const cfg = {
      ...base,
      seed: seed ?? base.seed,
      shadowingStdDb: sigma ?? base.shadowingStdDb,
      sampleRateHz: rate ?? base.sampleRateHz,
      packetLossProb: loss ?? base.packetLossProb,
    };
    const run = generateSyntheticRun(campaign, cfg, role);
    await saveRun(run);
    setMsg(`„${run.name}“ erzeugt (Seed ${cfg.seed}).`);
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Synthetische Messreihe erzeugen <Badge variant="synthetic">SYNTHETISCH</Badge>
        </span>
      }
      subtitle="Simulierte Signale auf dem Kampagnen-Grundriss – reproduzierbar über den Seed. Keine Messergebnisse."
    >
      <div className="space-y-4" data-testid="synthetic-generator">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Szenario" hint={meta.description}>
            <Select value={scenario} onChange={(e) => pick(e.target.value as SyntheticScenarioId)} data-testid="synth-scenario">
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rolle" hint="Kalibrierung für Pfadverlust-Fit/Fingerprints, Evaluation nur für Fehlermetriken.">
            <Select value={role} onChange={(e) => setRole(e.target.value as RunRole)} data-testid="synth-role">
              <option value="evaluation">Evaluation</option>
              <option value="calibration">Kalibrierung</option>
            </Select>
          </Field>
          <Field label="Seed">
            <NumberInput value={seed ?? base.seed} onChange={(v) => setSeed(v === null ? null : Math.round(v))} aria-label="Seed" />
          </Field>
          <Field label="Shadowing σ">
            <NumberInput value={sigma ?? base.shadowingStdDb} min={0} max={30} step={0.5} unit="dB" onChange={setSigma} aria-label="Shadowing σ" />
          </Field>
          <Field label="Senderate je Beacon">
            <NumberInput value={rate ?? base.sampleRateHz} min={0.1} max={20} step={0.1} unit="Hz" onChange={setRate} aria-label="Senderate" />
          </Field>
          <Field label="Paketverlust">
            <NumberInput value={loss ?? base.packetLossProb} min={0} max={0.95} step={0.01} onChange={setLoss} aria-label="Paketverlust" />
          </Field>
        </div>
        <Button variant="primary" onClick={generate} data-testid="synth-generate">
          Messreihe erzeugen
        </Button>
        {msg && (
          <Callout tone="synthetic" title="Synthetische Messreihe angelegt">
            {msg}
          </Callout>
        )}
      </div>
    </Card>
  );
}
