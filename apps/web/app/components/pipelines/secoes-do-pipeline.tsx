"use client";

import type { PipelineMemberRole, PipelinePeopleResponse } from "@plugga/shared";
import { useEffect, useState, type CSSProperties } from "react";

import { enviar } from "../../lib/clientes";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { novaChave } from "../../lib/pipelines";
import type { PropsDaSecao } from "./editor-de-pipeline";
import { Avatar, Icone } from "./icones";
import { SeletorDeCor } from "./seletor-de-cor";

function mover<T>(lista: T[], de: number, para: number): T[] {
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item!);
  return copia;
}

function ErroDaLista({ texto }: { texto?: string }) {
  return texto ? (
    <p className="aviso aviso--erro" role="alert">
      {texto}
    </p>
  ) : null;
}

function BotaoIcone({ rotulo, icone, aoClicar, desabilitado, perigo }: { rotulo: string; icone: "cima" | "baixo" | "lixeira"; aoClicar: () => void; desabilitado?: boolean; perigo?: boolean }) {
  return (
    <button type="button" className={`botao-icone${perigo ? " botao-icone--perigo" : ""}`} aria-label={rotulo} title={rotulo} disabled={desabilitado} onClick={aoClicar}>
      <Icone nome={icone} tamanho={15} />
    </button>
  );
}

export function SecaoEtapas({ rascunho, aoAlterar, erros, negociosPorEtapa }: PropsDaSecao & { negociosPorEtapa: Record<string, number> }) {
  const etapas = rascunho.stages;
  const [excluindo, setExcluindo] = useState<{ indice: number; destino: string } | null>(null);
  const [pega, setPega] = useState<number | null>(null);
  const [origem, setOrigem] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const alterar = (i: number, parcial: Partial<(typeof etapas)[number]>) =>
    aoAlterar({ stages: etapas.map((etapa, j) => (j === i ? { ...etapa, ...parcial } : etapa)) });
  const soltar = () => {
    setOrigem(null);
    setAlvo(null);
    setPega(null);
  };
  const quantos = (id?: string) => (id ? (negociosPorEtapa[id] ?? 0) : 0);
  /** Destinos possíveis: etapas já gravadas que continuam no pipeline. */
  const destinosPara = (i: number) => etapas.flatMap((e, j) => (j !== i && e.id ? [{ id: e.id, name: e.name || `Etapa ${j + 1}` }] : []));

  function excluir(i: number) {
    const etapa = etapas[i]!;
    if (quantos(etapa.id) === 0) return aoAlterar({ stages: etapas.filter((_, j) => j !== i) });
    setExcluindo({ indice: i, destino: destinosPara(i)[0]?.id ?? "" });
  }

  function confirmarExclusao(i: number) {
    const etapa = etapas[i]!;
    if (!excluindo?.destino || !etapa.id) return;
    aoAlterar({ stages: etapas.filter((_, j) => j !== i), stageDestinations: { ...rascunho.stageDestinations, [etapa.id]: excluindo.destino } });
    setExcluindo(null);
  }

  return (
    <div className="secao-lista">
      <ErroDaLista texto={erros.stages} />
      <div className="cabecalho-linhas cabecalho-linhas--etapas" aria-hidden="true">
        <span />
        <span>Etapa</span>
        <span>Parado após</span>
        <span />
      </div>
      <ol className="linhas-config">
        {etapas.map((etapa, i) => {
          const nome = etapa.name || `Etapa ${i + 1}`;
          return (
            <li
              key={etapa.chave}
              className={`linha-etapa${origem === i ? " linha--arrastando" : ""}${alvo === i && origem !== i ? " linha--alvo" : ""}`}
              draggable={pega === i}
              onDragStart={(e) => {
                setOrigem(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (origem === null) return;
                e.preventDefault();
                setAlvo(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (origem !== null && origem !== i) aoAlterar({ stages: mover(etapas, origem, i) });
                soltar();
              }}
              onDragEnd={soltar}
            >
              <span className="alca" title="Arraste para reordenar" aria-hidden="true" onPointerDown={() => setPega(i)} onPointerUp={() => setPega(null)}>
                <Icone nome="alca" />
              </span>
              <span className="linha-etapa-nome">
                <SeletorDeCor valor={etapa.color} rotulo={`Cor da etapa ${nome}`} aoMudar={(color) => alterar(i, { color })} />
                <input aria-label={`Nome da etapa ${i + 1}`} value={etapa.name} maxLength={60} placeholder="Nome da etapa" onChange={(e) => alterar(i, { name: e.target.value })} />
                {quantos(etapa.id) > 0 ? <span className="contagem-etapa">{quantos(etapa.id) === 1 ? "1 negócio" : `${quantos(etapa.id)} negócios`}</span> : null}
              </span>
              <span className="campo-dias">
                <input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  placeholder="—"
                  aria-label={`Dias para alertar parado em ${nome}`}
                  value={etapa.staleAfterDays ?? ""}
                  onChange={(e) => alterar(i, { staleAfterDays: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <span>dias</span>
              </span>
              <span className="acoes-linha">
                <BotaoIcone rotulo={`Subir ${nome}`} icone="cima" desabilitado={i === 0} aoClicar={() => aoAlterar({ stages: mover(etapas, i, i - 1) })} />
                <BotaoIcone rotulo={`Descer ${nome}`} icone="baixo" desabilitado={i === etapas.length - 1} aoClicar={() => aoAlterar({ stages: mover(etapas, i, i + 1) })} />
                <BotaoIcone rotulo={`Excluir ${nome}`} icone="lixeira" perigo desabilitado={etapas.length === 1} aoClicar={() => excluir(i)} />
              </span>
              {excluindo?.indice === i ? (
                <div className="excluir-etapa" role="group" aria-label={`Excluir ${nome}`}>
                  <span>
                    <b>{nome}</b> tem {quantos(etapa.id) === 1 ? "1 negócio" : `${quantos(etapa.id)} negócios`}. Para onde eles vão?
                  </span>
                  <select aria-label="Etapa de destino" value={excluindo.destino} onChange={(e) => setExcluindo({ indice: i, destino: e.target.value })}>
                    {destinosPara(i).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="button button--perigo" onClick={() => confirmarExclusao(i)}>
                    Excluir e mover
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setExcluindo(null)}>
                    Cancelar
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="adicionar-linha"
        disabled={etapas.length >= 20}
        onClick={() => aoAlterar({ stages: [...etapas, { chave: novaChave(), name: "", color: "#94A3B8", staleAfterDays: null }] })}
      >
        <Icone nome="mais" tamanho={15} /> Adicionar etapa
      </button>
      <p className="dica">Arraste pela alça ou use as setas para reordenar. Passado o prazo de parado, o negócio ganha um alerta no quadro; em branco, não alerta.</p>

      <h3 className="form-secao">Desfechos</h3>
      <div className="desfechos-config">
        <div className="desfecho-config desfecho-config--ganho">
          <label htmlFor="pipeline-ganho">
            <Icone nome="check" tamanho={14} /> Nome do Ganho neste pipeline *
          </label>
          <input id="pipeline-ganho" value={rascunho.wonLabel} maxLength={40} onChange={(e) => aoAlterar({ wonLabel: e.target.value })} />
          <small>Encerra o negócio como venda feita. Ex.: Contrato assinado.</small>
        </div>
        <div className="desfecho-config desfecho-config--perdido">
          <label htmlFor="pipeline-perdido">
            <Icone nome="x" tamanho={14} /> Nome do Perdido neste pipeline *
          </label>
          <input id="pipeline-perdido" value={rascunho.lostLabel} maxLength={40} onChange={(e) => aoAlterar({ lostLabel: e.target.value })} />
          <small>Encerra o negócio e exige um motivo de perda.</small>
        </div>
      </div>
    </div>
  );
}

export function SecaoEtiquetas({ rascunho, aoAlterar, erros }: PropsDaSecao) {
  const etiquetas = rascunho.tags;
  const alterar = (i: number, parcial: Partial<(typeof etiquetas)[number]>) =>
    aoAlterar({ tags: etiquetas.map((etiqueta, j) => (j === i ? { ...etiqueta, ...parcial } : etiqueta)) });

  return (
    <div className="secao-lista">
      <p className="dica">As etiquetas pertencem ao pipeline e aparecem nos cards e nos filtros.</p>
      {etiquetas.some((e) => e.name) ? (
        <div className="previa-etiquetas" aria-label="Prévia das etiquetas">
          {etiquetas
            .filter((e) => e.name)
            .map((e) => (
              <span key={e.chave} className="etiqueta" style={{ "--cor": e.color } as CSSProperties}>
                {e.name}
              </span>
            ))}
        </div>
      ) : null}
      <ErroDaLista texto={erros.tags} />
      {etiquetas.length === 0 ? <p className="lista-vazia">Nenhuma etiqueta ainda. Ex.: Grupo A, Indicação, Urgente.</p> : null}
      <ul className="linhas-config">
        {etiquetas.map((etiqueta, i) => (
          <li key={etiqueta.chave}>
            <span className="linha-etapa-nome">
              <SeletorDeCor valor={etiqueta.color} rotulo={`Cor da etiqueta ${etiqueta.name || i + 1}`} aoMudar={(color) => alterar(i, { color })} />
              <input aria-label={`Nome da etiqueta ${i + 1}`} value={etiqueta.name} maxLength={40} placeholder="Nome da etiqueta" onChange={(e) => alterar(i, { name: e.target.value })} />
            </span>
            <span className="acoes-linha">
              <BotaoIcone rotulo={`Excluir etiqueta ${etiqueta.name || i + 1}`} icone="lixeira" perigo aoClicar={() => aoAlterar({ tags: etiquetas.filter((_, j) => j !== i) })} />
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="adicionar-linha" onClick={() => aoAlterar({ tags: [...etiquetas, { chave: novaChave(), name: "", color: "#0077FF" }] })}>
        <Icone nome="mais" tamanho={15} /> Nova etiqueta
      </button>
    </div>
  );
}

export function SecaoMotivos({ rascunho, aoAlterar, erros }: PropsDaSecao) {
  const motivos = rascunho.lossReasons;
  const alterar = (i: number, parcial: Partial<(typeof motivos)[number]>) =>
    aoAlterar({ lossReasons: motivos.map((motivo, j) => (j === i ? { ...motivo, ...parcial } : motivo)) });

  return (
    <div className="secao-lista">
      <p className="dica">O vendedor escolhe um destes ao dar o negócio como perdido. Um motivo pode pedir a data para voltar a falar com o cliente.</p>
      <ErroDaLista texto={erros.lossReasons} />
      {motivos.length === 0 ? <p className="lista-vazia">Nenhum motivo de perda ainda.</p> : null}
      <ul className="linhas-config">
        {motivos.map((motivo, i) => (
          <li key={motivo.chave}>
            <input aria-label={`Motivo de perda ${i + 1}`} value={motivo.name} maxLength={80} placeholder="Motivo de perda" onChange={(e) => alterar(i, { name: e.target.value })} />
            <label className="chave-liga">
              <input type="checkbox" role="switch" checked={motivo.asksRevisitDate} onChange={(e) => alterar(i, { asksRevisitDate: e.target.checked })} />
              <span className="chave-liga-trilho" aria-hidden="true" />
              Pede data para revisitar
            </label>
            <span className="acoes-linha">
              <BotaoIcone rotulo={`Excluir motivo ${motivo.name || i + 1}`} icone="lixeira" perigo aoClicar={() => aoAlterar({ lossReasons: motivos.filter((_, j) => j !== i) })} />
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="adicionar-linha"
        onClick={() => aoAlterar({ lossReasons: [...motivos, { chave: novaChave(), name: "", asksRevisitDate: false }] })}
      >
        <Icone nome="mais" tamanho={15} /> Novo motivo
      </button>
    </div>
  );
}

const PAPEIS: { valor: PipelineMemberRole | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Fora" },
  { valor: "vendedor", rotulo: "Vendedor" },
  { valor: "gestor", rotulo: "Gestor" },
];

export function SecaoEquipe({ rascunho, aoAlterar, erros, nomesDaEquipe }: PropsDaSecao & { nomesDaEquipe: Record<string, string> }) {
  const [pessoas, setPessoas] = useState<PipelinePeopleResponse["people"] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const empresa = EMPRESAS_POR_ID[rascunho.companyId].nome;

  useEffect(() => {
    let vivo = true;
    setPessoas(null);
    setFalha(null);
    void enviar<PipelinePeopleResponse>(`/api/pipelines/pessoas?companyId=${rascunho.companyId}`, "GET").then((resposta) => {
      if (!vivo) return;
      if (resposta.ok) setPessoas(resposta.dados.people);
      else setFalha(resposta.erro.mensagem);
    });
    return () => {
      vivo = false;
    };
  }, [rascunho.companyId]);

  const papelDe = new Map(rascunho.members.map((m) => [m.userId, m.role]));
  const foraDaLista = rascunho.members
    .filter((m) => !(pessoas ?? []).some((p) => p.id === m.userId))
    .map((m) => ({ id: m.userId, name: nomesDaEquipe[m.userId] ?? "Pessoa sem papel comercial" }));
  const linhas = [...(pessoas ?? []), ...foraDaLista];
  const semPapel = (pessoas ?? []).filter((p) => !papelDe.has(p.id));

  function definir(pessoaId: string, papel: PipelineMemberRole | "") {
    const outros = rascunho.members.filter((m) => m.userId !== pessoaId);
    aoAlterar({ members: papel ? [...outros, { userId: pessoaId, role: papel }] : outros });
  }

  return (
    <div className="secao-lista">
      <p className="dica">
        Pessoas ativas com papel comercial na {empresa}. O <b>vendedor</b> vê o pipeline e todos os negócios dele; o <b>gestor</b> também altera esta
        configuração. O gestor comercial da empresa e o admin já alcançam todos os pipelines dela.
      </p>
      <ErroDaLista texto={erros.members} />
      <ErroDaLista texto={falha ?? undefined} />
      {pessoas === null && !falha ? <p className="lista-vazia">Carregando pessoas…</p> : null}
      {pessoas !== null && linhas.length === 0 ? <p className="lista-vazia">Ninguém com papel comercial na {empresa} ainda.</p> : null}
      {linhas.length > 0 ? (
        <ul className="linhas-config">
          {linhas.map((pessoa) => {
            const papel = papelDe.get(pessoa.id) ?? "";
            return (
              <li key={pessoa.id} className={papel ? "linha-pessoa linha-pessoa--na-equipe" : "linha-pessoa"}>
                <Avatar id={pessoa.id} nome={pessoa.name} />
                <span className="nome-pessoa">{pessoa.name}</span>
                <span className="seletor-tipo" role="radiogroup" aria-label={`Papel de ${pessoa.name} no pipeline`}>
                  {PAPEIS.map((opcao) => (
                    <button key={opcao.valor || "fora"} type="button" role="radio" aria-checked={papel === opcao.valor} onClick={() => definir(pessoa.id, opcao.valor)}>
                      {opcao.rotulo}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {semPapel.length > 0 ? (
        <button
          type="button"
          className="adicionar-linha"
          onClick={() => aoAlterar({ members: [...rascunho.members, ...semPapel.map((p) => ({ userId: p.id, role: "vendedor" as const }))] })}
        >
          <Icone nome="equipe" tamanho={15} /> Incluir todos como vendedores
        </button>
      ) : null}
    </div>
  );
}
