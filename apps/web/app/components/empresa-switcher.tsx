"use client";

import { EMPRESAS, EMPRESAS_POR_ID, type EmpresaId } from "../lib/organizacao";

/**
 * Seletor Plugga/Waze no topo à direita.
 *
 * A empresa ativa vive na URL (`?empresa=waze`), não em estado de sessão: um
 * link colado no WhatsApp precisa abrir na mesma empresa para quem recebe, e
 * com duas abas abertas em empresas diferentes um estado global aprovaria a
 * coisa errada sem ninguém notar.
 */
export function EmpresaSwitcher({
  empresa,
  onSelect,
}: {
  empresa: EmpresaId;
  onSelect: (proxima: EmpresaId) => void;
}) {
  return (
    <div className="empresa-switcher" role="group" aria-label="Empresa ativa">
      {EMPRESAS.map((id) => {
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
