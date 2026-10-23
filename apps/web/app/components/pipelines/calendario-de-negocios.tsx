"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { useState } from "react";

import { mesRelativo, montarCalendario } from "../../lib/calendario-negocios";
import { hojeNoFuso, ROTULO_STATUS, valorCurto } from "../../lib/negocios";
import { MenuDoNegocio } from "./cartao-de-negocio";
import { Icone } from "./icones";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import estilos from "./calendario-de-negocios.module.css";

const DIAS_DA_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const formatoMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const formatoDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function PrevisaoDoNegocio({ negocio, pipeline, acoes }: { negocio: Deal; pipeline: Pipeline; acoes: AcoesDoNegocio }) {
  return (
    <article className={estilos.negocio} aria-label={`Negócio ${negocio.title}`}>
      <div className={estilos.tituloNegocio}>
        <h4 title={negocio.title}>{negocio.title}</h4>
        {negocio.status === "open" ? <MenuDoNegocio negocio={negocio} pipeline={pipeline} acoes={acoes} /> : null}
      </div>
      <span className={estilos.cliente} title={negocio.client.name}>{negocio.client.name}</span>
      <div className={estilos.valor}>
        <span>{negocio.value === null ? "Sem valor" : valorCurto(Number(negocio.value))}</span>
        {negocio.status !== "open" ? <span>{ROTULO_STATUS[negocio.status]}</span> : null}
      </div>
    </article>
  );
}

/** Previsões mensais, com os mesmos filtros e ações das outras visões. */
export function CalendarioDeNegocios({ pipeline, negocios, acoes }: { pipeline: Pipeline; negocios: Deal[]; acoes: AcoesDoNegocio }) {
  const hoje = hojeNoFuso();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const { dias, semPrevisao, totalNoMes } = montarCalendario(negocios, mes);
  const rotuloMes = formatoMes.format(new Date(`${mes}-01T00:00:00Z`));

  return (
    <section className={estilos.calendario} aria-label="Calendário de fechamentos">
      <header className={estilos.cabecalho}>
        <div>
          <h2 aria-live="polite">{rotuloMes}</h2>
          <p>{totalNoMes} {totalNoMes === 1 ? "fechamento previsto" : "fechamentos previstos"} neste mês</p>
        </div>
        <div className={estilos.navegacao}>
          <button type="button" onClick={() => setMes(hoje.slice(0, 7))}>Hoje</button>
          <button type="button" aria-label="Mês anterior" onClick={() => setMes((atual) => mesRelativo(atual, -1))}>
            <span className={estilos.anterior}><Icone nome="seta" /></span>
          </button>
          <button type="button" aria-label="Próximo mês" onClick={() => setMes((atual) => mesRelativo(atual, 1))}>
            <Icone nome="seta" />
          </button>
        </div>
      </header>
      {totalNoMes === 0 ? <p className={estilos.vazio} role="status">Nenhum fechamento previsto neste mês com estes filtros.</p> : null}
      <div className={estilos.semana} aria-hidden="true">
        {DIAS_DA_SEMANA.map((dia) => <span key={dia}>{dia}</span>)}
      </div>
      <div className={estilos.dias}>
        {dias.map((dia) => (
          <section key={dia.data} className={estilos.dia} aria-label={formatoDia.format(new Date(`${dia.data}T00:00:00Z`))} data-fora={!dia.noMes} data-vazio={dia.negocios.length === 0}>
            <h3>
              <time dateTime={dia.data} aria-current={dia.data === hoje ? "date" : undefined}>
                <span className={estilos.numero}>{dia.numero}</span>
                <span className={estilos.dataCompleta}>{formatoDia.format(new Date(`${dia.data}T00:00:00Z`))}</span>
              </time>
            </h3>
            {dia.negocios.map((negocio) => <PrevisaoDoNegocio key={negocio.id} negocio={negocio} pipeline={pipeline} acoes={acoes} />)}
          </section>
        ))}
      </div>
      <section className={estilos.semPrevisao} aria-label="Negócios sem previsão">
        <h3>Sem previsão <span>{semPrevisao.length}</span></h3>
        {semPrevisao.length === 0 ? <p>Nenhum negócio sem previsão com estes filtros.</p> : (
          <div className={estilos.semPrevisaoLista}>
            {semPrevisao.map((negocio) => <PrevisaoDoNegocio key={negocio.id} negocio={negocio} pipeline={pipeline} acoes={acoes} />)}
          </div>
        )}
      </section>
    </section>
  );
}
