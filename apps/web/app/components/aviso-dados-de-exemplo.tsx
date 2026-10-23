import { StatusPill } from "./plugga-shell";

/**
 * Aviso fixo para telas que ainda não têm backend (US12, T130, SC-017).
 *
 * A Central de Pendências ainda mostra números de apresentação. O aviso
 * identifica esses dados enquanto não há integração com o pipeline.
 */
export function AvisoDadosDeExemplo({ detalhe }: { detalhe?: string }) {
  return (
    <div
      role="note"
      data-testid="aviso-dados-de-exemplo"
      style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}
    >
      <StatusPill variant="warning">Dados de exemplo</StatusPill>
      <span className="card-note" style={{ margin: 0 }}>
        {detalhe ?? "Esta tela ainda não está ligada a dados reais; os números abaixo são ilustrativos."}
      </span>
    </div>
  );
}
