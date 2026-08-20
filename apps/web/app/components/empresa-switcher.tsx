"use client";

import React from "react";
import { EMPRESAS_POR_ID, type EmpresaId } from "../lib/organizacao";

/**
 * Seletor Plugga/Waze no topo à direita.
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

  const renderIcon = (id: EmpresaId) => {
    if (id === "plugga") {
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", flexShrink: 0 }}>
          <path d="M12 2v10" />
          <path d="M18.4 6.6a9 9 0 1 1-12.77 0" />
        </svg>
      );
    }
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", flexShrink: 0 }}>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    );
  };

  if (empresas.length === 1) {
    const unica = empresas[0]!;
    const { nome } = EMPRESAS_POR_ID[unica];
    return (
      <div className="empresa-switcher empresa-switcher--unica">
        <span className="empresa-option empresa-option--active" title={nome}>
          {renderIcon(unica)}
          <span className="empresa-nome">{nome}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="empresa-switcher" role="group" aria-label="Empresa ativa">
      {empresas.map((id) => {
        const { nome } = EMPRESAS_POR_ID[id];
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
            {renderIcon(id)}
            <span className="empresa-nome">{nome}</span>
          </button>
        );
      })}
    </div>
  );
}
