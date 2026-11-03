"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Fragment } from "react";

export function paginasDaLista(pagina: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const inicio = Math.max(1, Math.min(pagina - 1, total - 2));
  return [...new Set([1, inicio, inicio + 1, inicio + 2, total])].sort((a, b) => a - b);
}

export function PaginacaoDaLista({ pagina, totalItens, itensPorPagina, aoMudarPagina, entidade = "leads" }: {
  pagina: number;
  totalItens: number;
  itensPorPagina: number;
  aoMudarPagina: (pagina: number) => void;
  entidade?: "leads" | "clientes";
}) {
  const totalPaginas = Math.max(1, Math.ceil(totalItens / itensPorPagina));
  const inicio = (pagina - 1) * itensPorPagina + 1;
  const fim = Math.min(pagina * itensPorPagina, totalItens);
  const paginas = paginasDaLista(pagina, totalPaginas);

  return <nav className="lista-paginacao" aria-label={`Paginação da lista de ${entidade}`}>
    <span className="lista-paginacao-info" role="status">
      Mostrando <strong>{inicio}–{fim}</strong> de <strong>{totalItens}</strong> {totalItens === 1 ? entidade === "clientes" ? "cliente" : "lead" : entidade}
    </span>
    <div className="lista-paginacao-controles">
      <button type="button" className="lista-paginacao-btn" disabled={pagina === 1} onClick={() => aoMudarPagina(1)} aria-label="Primeira página">
        <ChevronsLeft size={12} aria-hidden="true" />
      </button>
      <button type="button" className="lista-paginacao-btn" disabled={pagina === 1} onClick={() => aoMudarPagina(pagina - 1)} aria-label="Página anterior">
        <ChevronLeft size={12} aria-hidden="true" />
      </button>
      <div className="lista-paginacao-paginas">
        {paginas.map((num, indice) => <Fragment key={num}>
          {indice > 0 && num - paginas[indice - 1]! > 1 ? <span className="lista-paginacao-reticencias" aria-hidden="true">…</span> : null}
          <button type="button" className={`lista-paginacao-num${pagina === num ? " lista-paginacao-num--ativo" : ""}`}
            onClick={() => aoMudarPagina(num)} aria-label={`Ir para a página ${num}`} aria-current={pagina === num ? "page" : undefined}>
            {num}
          </button>
        </Fragment>)}
      </div>
      <button type="button" className="lista-paginacao-btn" disabled={pagina === totalPaginas} onClick={() => aoMudarPagina(pagina + 1)} aria-label="Próxima página">
        <ChevronRight size={12} aria-hidden="true" />
      </button>
      <button type="button" className="lista-paginacao-btn" disabled={pagina === totalPaginas} onClick={() => aoMudarPagina(totalPaginas)} aria-label="Última página">
        <ChevronsRight size={12} aria-hidden="true" />
      </button>
    </div>
  </nav>;
}
