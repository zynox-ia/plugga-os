import { StatusPill } from "./plugga-shell";

/**
 * Aviso fixo para telas que ainda não têm backend (US12, T130, SC-017).
 *
 * Dashboard e Central de Pendências mostram números de apresentação. Sem este
 * aviso, quem lê não tem como distinguir exemplo de dado real; a navegação
 * também os marca como `parcial` (lib/organizacao.ts).
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
