"use client";

import type { ContractSummary } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatarData } from "../lib/format";
import { NovoContratoModal } from "./contratos/novo-contrato-modal";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";
import { Button, IconPlus } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  revisao_interna: "Revisão interna",
  aguardando_assinatura: "Aguardando assinatura",
  ativo: "Ativo",
  vencendo: "Vencendo",
  encerrado: "Encerrado",
};

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  rascunho: "neutral",
  revisao_interna: "neutral",
  aguardando_assinatura: "warning",
  ativo: "success",
  vencendo: "warning",
  encerrado: "neutral",
};

function isBlocked(item: ContractSummary): boolean {
  const inFlight = item.status !== "rascunho" && item.status !== "encerrado";
  return inFlight && (!item.ownerId || !item.nextActionAt);
}

export function ContratosView({ items, isLive }: { items: ContractSummary[]; isLive: boolean }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <ShellCard className="table-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Comercial</span>
          <h2>Contratos</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          <Button
            variant="primary"
            icon={<IconPlus />}
            onClick={() => setShowCreate(true)}
          >
            Novo contrato
          </Button>
        </div>
      </div>

      {showCreate ? (
        <NovoContratoModal
          aoFechar={() => setShowCreate(false)}
          aoCriar={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}

      <ShellTable caption="Contratos">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Status</th>
            <th>Responsável</th>
            <th>Vigência</th>
            <th>Próxima ação</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link href={`/comercial/contratos/${item.id}`}>{item.clientName}</Link>
              </td>
              <td>
                <StatusPill variant={STATUS_VARIANT[item.status] ?? "neutral"}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </StatusPill>
                {isBlocked(item) ? <StatusPill variant="danger">Sem responsável/ação</StatusPill> : null}
              </td>
              <td>{item.ownerName ?? "—"}</td>
              <td>
                {formatarData(item.startsAt)} – {formatarData(item.endsAt)}
              </td>
              <td>
                {formatarData(item.nextActionAt)}
                {item.nextActionNote ? ` · ${item.nextActionNote}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </ShellTable>
      {items.length === 0 ? <p className="card-note">Nenhum contrato ainda.</p> : null}
    </ShellCard>
  );
}
