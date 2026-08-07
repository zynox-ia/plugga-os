"use client";

import type { ContractSummary } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createContract } from "../lib/commercial-client";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

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

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isBlocked(item: ContractSummary): boolean {
  const inFlight = item.status !== "rascunho" && item.status !== "encerrado";
  return inFlight && (!item.ownerId || !item.nextActionAt);
}

export function ContratosView({ items, isLive }: { items: ContractSummary[]; isLive: boolean }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createContract({ clientId: String(formData.get("clientId") ?? "").trim() });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setShowCreate(false);
    router.refresh();
  }

  return (
    <ShellCard className="table-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Comercial</span>
          <h2>Contratos</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          <button className="button button--accent" type="button" onClick={() => setShowCreate((open) => !open)}>
            + Novo contrato
          </button>
        </div>
      </div>

      {showCreate ? (
        <form action={handleCreate} style={{ padding: "0 18px 18px", display: "grid", gap: 8 }}>
          <p className="card-note" style={{ padding: 0 }}>
            Contratos também nascem automaticamente ao marcar uma oportunidade como ganha (veja o detalhe da
            oportunidade). Use este formulário para abrir um contrato direto na ficha de um cliente já existente.
          </p>
          <label>
            Cliente existente (ID)
            <input name="clientId" required placeholder="uuid do cliente" />
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row-actions">
            <button className="button button--accent" type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar contrato"}
            </button>
            <button className="button" type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
          </div>
        </form>
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
                {formatDate(item.startsAt)} – {formatDate(item.endsAt)}
              </td>
              <td>
                {formatDate(item.nextActionAt)}
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
