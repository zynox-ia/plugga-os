import { EstudosView } from "../../components/estudos-view";
import { fetchConsumerUnits, fetchEnergyStudies } from "../../lib/api";

export const metadata = { title: "Eficiência energética · plugga-os" };

export default async function EstudosPage() {
  const [estudos, ucs] = await Promise.all([fetchEnergyStudies(), fetchConsumerUnits()]);

  return (
    <EstudosView
      items={estudos?.items ?? []}
      consumerUnits={ucs?.items ?? []}
      isLive={estudos !== null}
    />
  );
}
