"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

export function paginasDaLista(pagina: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const inicio = Math.max(1, Math.min(pagina - 1, total - 2));
  return [...new Set([1, inicio, inicio + 1, inicio + 2, total])].sort((a, b) => a - b);
}

export function PaginacaoDaLista({ pagina, totalItens, itensPorPagina, aoMudarPagina }: {
  pagina: number;
  totalItens: number;
  itensPorPagina: number;
  aoMudarPagina: (pagina: number) => void;
}) {
  const totalPaginas = Math.max(1, Math.ceil(totalItens / itensPorPagina));
  const inicio = (pagina - 1) * itensPorPagina + 1;
  const fim = Math.min(pagina * itensPorPagina, totalItens);
  const paginas = paginasDaLista(pagina, totalPaginas);
  const [destino, setDestino] = useState(String(pagina));
  useEffect(() => setDestino(String(pagina)), [pagina, totalPaginas]);

  return <nav className="lista-paginacao" aria-label="Paginação da lista de leads">
    <div className="lista-paginacao-resumo">
      <span className="lista-paginacao-tamanho">{itensPorPagina} por página</span>
      <span className="lista-paginacao-info" role="status">
        Mostrando <strong>{inicio}–{fim}</strong> de <strong>{totalItens}</strong> {totalItens === 1 ? "lead" : "leads"}
      </span>
    </div>
    <div className="lista-paginacao-controles">
      <button type="button" className="lista-paginacao-btn" disabled={pagina === 1} onClick={() => aoMudarPagina(1)} aria-label="Primeira página">
        <ChevronsLeft size={14} aria-hidden="true" />
      </button>
      <button type="button" className="lista-paginacao-btn" disabled={pagina === 1} onClick={() => aoMudarPagina(pagina - 1)} aria-label="Página anterior">
        <ChevronLeft size={14} aria-hidden="true" />
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
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <button type="button" className="lista-paginacao-btn" disabled={pagina === totalPaginas} onClick={() => aoMudarPagina(totalPaginas)} aria-label="Última página">
        <ChevronsRight size={14} aria-hidden="true" />
      </button>
    </div>
    <form className="lista-paginacao-salto" onSubmit={(event) => {
      event.preventDefault();
      const numero = Number(destino);
      if (Number.isInteger(numero) && numero >= 1 && numero <= totalPaginas) aoMudarPagina(numero);
    }}>
      <label>Ir para página
        <input name="pagina" type="number" inputMode="numeric" min={1} max={totalPaginas} step={1} required value={destino} onChange={(event) => setDestino(event.target.value)} />
      </label>
      <button type="submit" className="lista-paginacao-btn">Ir</button>
    </form>
  </nav>;
}
