"use client";

import { EMPRESAS_POR_ID, type EmpresaId } from "../lib/organizacao";

/**
 * Seletor Plugga/Waze no topo à direita.
 *
 * A empresa ativa vive na URL (`?empresa=waze`), não em estado de sessão: um
 * link colado no WhatsApp precisa abrir na mesma empresa para quem recebe, e
 * com duas abas abertas em empresas diferentes um estado global aprovaria a
 * coisa errada sem ninguém notar.
 *
 * Só entram as empresas do acesso da pessoa. Com uma só, vira etiqueta: um
 * seletor de uma opção promete uma escolha que não existe e ainda esconde o
 * fato de que a outra empresa simplesmente não é sua.
 */
export function EmpresaSwitcher({
  empresa,
  empresas,
  onSelect,
}: {
  empresa: EmpresaId;
  empresas: readonly EmpresaId[];
  onSelect: (proxima: EmpresaId) => void;
}) {
  if (empresas.length === 0) {
    return null;
  }

  if (empresas.length === 1) {
    const unica = empresas[0]!;
    const { nome, sigla } = EMPRESAS_POR_ID[unica];
    return (
      <div className="empresa-switcher empresa-switcher--unica">
        <span className="empresa-option empresa-option--active" title={nome}>
          <span className="empresa-sigla" aria-hidden="true">
            {sigla}
          </span>
          <span className="empresa-nome">{nome}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="empresa-switcher" role="group" aria-label="Empresa ativa">
      {empresas.map((id) => {
        const { nome, sigla } = EMPRESAS_POR_ID[id];
        const ativa = id === empresa;

        return (
          <button
            key={id}
            type="button"
            className={`empresa-option${ativa ? " empresa-option--active" : ""}`}
            onClick={() => onSelect(id)}
            aria-pressed={ativa}
            title={nome}
          >
            <span className="empresa-sigla" aria-hidden="true">{sigla}</span>
            <span className="empresa-nome">{nome}</span>
          </button>
        );
      })}
    </div>
  );
}
