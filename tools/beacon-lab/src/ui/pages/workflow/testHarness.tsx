/** Test helper: seeds the demo campaign into the store, opens it in a LabProvider and renders children once active. */
import { useEffect, type ReactNode } from "react";
import { store } from "../../../data/store";
import { createDemoCampaign } from "../../../data/synthetic";
import { LabProvider, useLab } from "../../state/LabContext";

export async function seedDemo(): Promise<string> {
  await store.clearAll();
  const { campaign, runs } = createDemoCampaign();
  await store.saveCampaign(campaign);
  for (const r of runs) await store.saveRun(r);
  return campaign.id;
}

function Gate({ id, children }: { id: string; children: ReactNode }) {
  const lab = useLab();
  useEffect(() => {
    void lab.openCampaign(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return lab.campaign ? <>{children}</> : <p>lade</p>;
}

export function WithCampaign({ id, children }: { id: string; children: ReactNode }) {
  return (
    <LabProvider>
      <Gate id={id}>{children}</Gate>
    </LabProvider>
  );
}
