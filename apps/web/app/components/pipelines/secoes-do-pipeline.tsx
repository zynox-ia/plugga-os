"use client";

import type { PipelineMemberRole, PipelinePeopleResponse } from "@plugga/shared";
import { useEffect, useState, type CSSProperties } from "react";

import { enviar } from "../../lib/clientes";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { CORES, NOME_DA_COR, novaChave, ROTULO_PAPEL } from "../../lib/pipelines";
import type { PropsDaSecao } from "./editor-de-pipeline";

function mover<T>(lista: T[], de: number, para: number): T[] {
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item!);
  return copia;
}

function SeletorDeCor({ valor, rotulo, aoMudar }: { valor: string; rotulo: string; aoMudar: (cor: string) => void }) {
  const conhecida = (CORES as readonly string[]).includes(valor);
  return (
    <span className="seletor-cor" style={{ "--cor": valor } as CSSProperties}>
      <span className="ponto-cor" aria-hidden="true" />
      <select aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {conhecida ? null : <option value={valor}>Personalizada</option>}
        {CORES.map((cor) => (
          <option key={cor} value={cor}>
            {NOME_DA_COR[cor]}
          </option>
        ))}
      </select>
    </span>
  );
}

function ErroDaLista({ texto }: { texto?: string }) {
  return texto ? (
    <p className="aviso aviso--erro" role="alert">
      {texto}
    </p>
  ) : null;
}

export function SecaoEtapas({ rascunho, aoAlterar, erros }: PropsDaSecao) {
  const etapas = rascunho.stages;
  const [pega, setPega] = useState<number | null>(null);
  const [origem, setOrigem] = useState<number | null>(null);
  const alterar = (i: number, parcial: Partial<(typeof etapas)[number]>) =>
    aoAlterar({ stages: etapas.map((etapa, j) => (j === i ? { ...etapa, ...parcial } : etapa)) });

  return (
    <div className="secao-lista">
      <ErroDaLista texto={erros.stages} />
      <ol className="linhas-config linhas-etapas">
        {etapas.map((etapa, i) => {
          const nome = etapa.name || `Etapa ${i + 1}`;
          return (
            <li
              key={etapa.chave}
              draggable={pega === i}
              className={origem === i ? "arrastando" : undefined}
              onDragStart={(e) => {
                setOrigem(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => origem !== null && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (origem !== null && origem !== i) aoAlterar({ stages: mover(etapas, origem, i) });
                setOrigem(null);
                setPega(null);
              }}
              onDragEnd={() => {
                setOrigem(null);
                setPega(null);
              }}
            >
              <span className="alca" title="Arraste para reordenar" aria-hidden="true" onPointerDown={() => setPega(i)} onPointerUp={() => setPega(null)}>
                ⋮⋮
              </span>
              <SeletorDeCor valor={etapa.color} rotulo={`Cor da etapa ${nome}`} aoMudar={(color) => alterar(i, { color })} />
              <input aria-label={`Nome da etapa ${i + 1}`} value={etapa.name} maxLength={60} onChange={(e) => alterar(i, { name: e.target.value })} />
              <label className="parado">
                Alertar se parado há
                <input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  aria-label={`Dias para alertar parado em ${nome}`}
                  value={etapa.staleAfterDays ?? ""}
                  onChange={(e) => alterar(i, { staleAfterDays: e.target.value === "" ? null : Number(e.target.value) })}
                />
                dias
              </label>
              <span className="acoes-linha">
                <button type="button" aria-label={`Subir ${nome}`} disabled={i === 0} onClick={() => aoAlterar({ stages: mover(etapas, i, i - 1) })}>
                  ↑
                </button>
                <button type="button" aria-label={`Descer ${nome}`} disabled={i === etapas.length - 1} onClick={() => aoAlterar({ stages: mover(etapas, i, i + 1) })}>
                  ↓
                </button>
                <button type="button" aria-label={`Excluir ${nome}`} disabled={etapas.length === 1} onClick={() => aoAlterar({ stages: etapas.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </span>
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
        + Adicionar etapa
      </button>
      <p className="dica">Arraste ⋮⋮ ou use ↑ ↓ para reordenar. Passado o prazo de parado, o negócio ganha um alerta no quadro. Deixe em branco para não alertar.</p>

      <h3 className="form-secao">Desfechos (fixos em todo pipeline)</h3>
      <div className="form-grade">
        <div className="field">
          <label htmlFor="pipeline-ganho">Nome do Ganho neste pipeline *</label>
          <input id="pipeline-ganho" value={rascunho.wonLabel} maxLength={40} onChange={(e) => aoAlterar({ wonLabel: e.target.value })} />
          <span className="dica">Encerra o negócio como venda feita. Ex.: Contrato assinado.</span>
        </div>
        <div className="field">
          <label htmlFor="pipeline-perdido">Nome do Perdido neste pipeline *</label>
          <input id="pipeline-perdido" value={rascunho.lostLabel} maxLength={40} onChange={(e) => aoAlterar({ lostLabel: e.target.value })} />
          <span className="dica">Exige um motivo de perda.</span>
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
      <ErroDaLista texto={erros.tags} />
      {etiquetas.length === 0 ? <p className="ficha-vazio">Nenhuma etiqueta ainda.</p> : null}
      <ul className="linhas-config">
        {etiquetas.map((etiqueta, i) => (
          <li key={etiqueta.chave}>
            <SeletorDeCor valor={etiqueta.color} rotulo={`Cor da etiqueta ${etiqueta.name || i + 1}`} aoMudar={(color) => alterar(i, { color })} />
            <input aria-label={`Nome da etiqueta ${i + 1}`} value={etiqueta.name} maxLength={40} onChange={(e) => alterar(i, { name: e.target.value })} />
            <span className="acoes-linha">
              <button type="button" aria-label={`Excluir etiqueta ${etiqueta.name || i + 1}`} onClick={() => aoAlterar({ tags: etiquetas.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="adicionar-linha" onClick={() => aoAlterar({ tags: [...etiquetas, { chave: novaChave(), name: "", color: "#0077FF" }] })}>
        + Nova etiqueta
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
      <p className="dica">O vendedor escolhe um destes ao dar o negócio como perdido. Um motivo pode pedir a data para revisitar o cliente.</p>
      <ErroDaLista texto={erros.lossReasons} />
      {motivos.length === 0 ? <p className="ficha-vazio">Nenhum motivo de perda ainda.</p> : null}
      <ul className="linhas-config">
        {motivos.map((motivo, i) => (
          <li key={motivo.chave}>
            <input aria-label={`Motivo de perda ${i + 1}`} value={motivo.name} maxLength={80} onChange={(e) => alterar(i, { name: e.target.value })} />
            <label className="caixa-marcar">
              <input type="checkbox" checked={motivo.asksRevisitDate} onChange={(e) => alterar(i, { asksRevisitDate: e.target.checked })} />
              Pede data para revisitar
            </label>
            <span className="acoes-linha">
              <button type="button" aria-label={`Excluir motivo ${motivo.name || i + 1}`} onClick={() => aoAlterar({ lossReasons: motivos.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="adicionar-linha"
        onClick={() => aoAlterar({ lossReasons: [...motivos, { chave: novaChave(), name: "", asksRevisitDate: false }] })}
      >
        + Novo motivo
      </button>
    </div>
  );
}

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

  function definir(pessoaId: string, papel: PipelineMemberRole | "") {
    const outros = rascunho.members.filter((m) => m.userId !== pessoaId);
    aoAlterar({ members: papel ? [...outros, { userId: pessoaId, role: papel }] : outros });
  }

  const semPapel = (pessoas ?? []).filter((p) => !papelDe.has(p.id));

  return (
    <div className="secao-lista">
      <p className="dica">
        Só pessoas ativas com papel comercial na {empresa} aparecem aqui. O vendedor vê o pipeline e todos os negócios dele; o gestor do
        pipeline também altera esta configuração. O gestor comercial da empresa e o admin já alcançam todos os pipelines dela.
      </p>
      <ErroDaLista texto={erros.members} />
      {falha ? <ErroDaLista texto={falha} /> : null}
      {pessoas === null && !falha ? <p className="ficha-vazio">Carregando pessoas…</p> : null}
      {pessoas !== null && linhas.length === 0 ? <p className="ficha-vazio">Ninguém com papel comercial na {empresa} ainda.</p> : null}
      {linhas.length > 0 ? (
        <ul className="linhas-config linhas-equipe">
          {linhas.map((pessoa) => (
            <li key={pessoa.id}>
              <span className="nome-pessoa">{pessoa.name}</span>
              <select aria-label={`Papel de ${pessoa.name} no pipeline`} value={papelDe.get(pessoa.id) ?? ""} onChange={(e) => definir(pessoa.id, e.target.value as PipelineMemberRole | "")}>
                <option value="">Fora da equipe</option>
                <option value="vendedor">{ROTULO_PAPEL.vendedor}</option>
                <option value="gestor">{ROTULO_PAPEL.gestor}</option>
              </select>
            </li>
          ))}
        </ul>
      ) : null}
      {semPapel.length > 0 ? (
        <button
          type="button"
          className="adicionar-linha"
          onClick={() => aoAlterar({ members: [...rascunho.members, ...semPapel.map((p) => ({ userId: p.id, role: "vendedor" as const }))] })}
        >
          + Incluir todos como vendedores
        </button>
      ) : null}
    </div>
  );
}
