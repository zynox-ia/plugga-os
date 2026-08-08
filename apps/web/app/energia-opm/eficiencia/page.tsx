import { EstudosView } from "../../components/estudos-view";
import { fetchConsumerUnits, fetchEnergyStudies } from "../../lib/api";

export const metadata = { title: "Eficiência energética · Plugga OS" };

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
