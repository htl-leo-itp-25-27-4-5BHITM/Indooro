import { Callout, EmptyState, PageHeader, Section } from "../components";
import { useCampaign } from "../state/LabContext";
import { ImportWizard } from "./workflow/ImportWizard";
import { RunCard } from "./workflow/RunCard";
import { SyntheticGenerator } from "./workflow/SyntheticGenerator";

export function DataPage() {
  const { campaign, runs, results } = useCampaign();
  const hasSynthetic = campaign.floorPlan.origin === "synthetic" || runs.some((r) => r.origin === "synthetic");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messdaten & Qualität"
        breadcrumbs={["Kampagne", "Messdaten"]}
        origin={hasSynthetic ? "synthetic" : "real"}
        description="Messreihen importieren, Datenqualität prüfen, Rollen festlegen. Kalibrierungs- und Evaluationsläufe bleiben strikt getrennt."
      />
      {!campaign.floorPlan.scale.confirmed && (
        <Callout tone="warning" title="Maßstab nicht bestätigt">
          Referenzpositionen und Fehler werden in Layout-Einheiten (LE) behandelt.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ImportWizard />
        <SyntheticGenerator />
      </div>

      <Section title={`Messreihen (${runs.length})`} description="Details aufklappen für Qualitätsbericht, Herkunft und Bearbeitung.">
        {runs.length === 0 ? (
          <EmptyState title="Noch keine Messreihen" description="Importieren Sie eine Datei oder erzeugen Sie eine synthetische Messreihe." />
        ) : (
          <div className="space-y-3" data-testid="run-list">
            {runs.map((r) => (
              <RunCard key={r.id} run={r} resultCount={results.filter((x) => x.result.runId === r.id).length} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
