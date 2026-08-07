"use client";

import { CONTRACT_STATUS_SEQUENCE, type ContractDetail } from "@plugga/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateContractStatus } from "../lib/commercial-client";
import { ShellCard, StatusPill } from "./plugga-shell";

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

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function ContratoDetailView({ contract }: { contract: ContractDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = CONTRACT_STATUS_SEQUENCE.indexOf(contract.status);
  const nextStatus = CONTRACT_STATUS_SEQUENCE[currentIndex + 1];

  async function handleAdvance(formData: FormData) {
    if (!nextStatus) return;
    setPending(true);
    setError(null);
    const signedAtLocal = String(formData.get("signedAt") ?? "");
    const nextActionAtLocal = String(formData.get("nextActionAt") ?? "");
    const result = await updateContractStatus(contract.id, {
      status: nextStatus,
      ownerId: String(formData.get("ownerId") ?? "").trim() || undefined,
      nextActionAt: nextActionAtLocal ? new Date(nextActionAtLocal).toISOString() : undefined,
      nextActionNote: String(formData.get("nextActionNote") ?? "").trim() || undefined,
      signedAt: signedAtLocal ? new Date(signedAtLocal).toISOString() : undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="detail" style={{ display: "grid", gridTemplateColumns: "1.25fr .8fr", gap: 16 }}>
      <section>
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Comercial · Contrato</span>
              <h2>{contract.clientName}</h2>
            </div>
            <StatusPill variant={STATUS_VARIANT[contract.status] ?? "neutral"}>
              {STATUS_LABEL[contract.status] ?? contract.status}
            </StatusPill>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
            <p>
              Responsável: <strong>{contract.ownerName ?? "sem responsável"}</strong>
            </p>
            <p>
              Vigência: <strong>{formatDateTime(contract.startsAt)}</strong> até{" "}
              <strong>{formatDateTime(contract.endsAt)}</strong>
            </p>
            <p>
              Assinatura: <strong>{contract.signedAt ? formatDateTime(contract.signedAt) : "pendente"}</strong>
            </p>
            <div className="box" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <strong>Próxima ação</strong>
              <p style={{ margin: "6px 0 0" }}>
                {contract.nextActionNote ?? "sem nota registrada"} — {formatDateTime(contract.nextActionAt)}
              </p>
            </div>
            <p className="card-note" style={{ padding: 0 }}>
              Minuta e documentos ficam na Biblioteca (fora de escopo deste bloco) — apenas referência textual aqui.
            </p>
          </div>
        </ShellCard>
      </section>

      <aside>
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ciclo contratual</span>
              <h2>Avançar estado</h2>
            </div>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 8 }}>
            <p className="card-note" style={{ padding: 0 }}>
              rascunho → revisão interna → aguardando assinatura → ativo → vencendo → encerrado
            </p>
            {nextStatus ? (
              <button className="button button--accent" type="button" onClick={() => setShowForm((open) => !open)}>
                Avançar para {STATUS_LABEL[nextStatus]}
              </button>
            ) : (
              <p className="card-note" style={{ padding: 0 }}>
                Contrato encerrado — sem novas transições.
              </p>
            )}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </ShellCard>

        {showForm && nextStatus ? (
          <ShellCard className="panel-card">
            <form action={handleAdvance} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Responsável (opcional se já definido)
                <input name="ownerId" placeholder="uuid do responsável" />
              </label>
              <label>
                Próxima ação (opcional se já definida)
                <input name="nextActionAt" type="datetime-local" />
              </label>
              <label>
                Nota da próxima ação
                <input name="nextActionNote" maxLength={500} />
              </label>
              {nextStatus === "ativo" ? (
                <label>
                  Data de assinatura (obrigatória para ativar)
                  <input name="signedAt" type="datetime-local" />
                </label>
              ) : null}
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Confirmar
                </button>
                <button className="button" type="button" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}
      </aside>
    </div>
  );
}
