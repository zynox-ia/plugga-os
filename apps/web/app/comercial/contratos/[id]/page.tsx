import Link from "next/link";

import { ContratoDetailView } from "../../../components/contrato-detail-view";
import { ShellCard } from "../../../components/plugga-shell";
import { fetchContract } from "../../../lib/api";

export default async function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await fetchContract(id);

  if (!contract) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Comercial</span>
            <h2>Contrato não encontrado</h2>
          </div>
        </div>
        <p className="card-note">
          Não foi possível carregar este contrato agora. <Link href="/comercial/contratos">Voltar à lista</Link>.
        </p>
      </ShellCard>
    );
  }

  return <ContratoDetailView contract={contract} />;
}
