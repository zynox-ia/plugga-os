"use client";

import type { PipelineMemberRole, PipelinePeopleResponse } from "@plugga/shared";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { enviar } from "../../lib/clientes";
import { novaChave } from "../../lib/pipelines";
import { Button } from "../ui/button";
import { IconPlus } from "../ui/icons";
import { Switch } from "../ui/selection";
import type { PropsDaSecao } from "./editor-de-pipeline";
import { Avatar } from "./icones";
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

function BotaoAcaoLinha({
  rotulo,
  icone,
  aoClicar,
  desabilitado,
  perigo,
}: {
  rotulo: string;
  icone: "cima" | "baixo" | "lixeira";
  aoClicar: () => void;
  desabilitado?: boolean;
  perigo?: boolean;
}) {
  return (
    <Button
      variant={perigo ? "danger" : "secondary"}
      size="sm"
      iconOnly
      aria-label={rotulo}
      title={rotulo}
      disabled={desabilitado}
      onClick={aoClicar}
      className={perigo ? "botao-acao--perigo" : ""}
      icon={
        icone === "cima" ? (
          <ChevronUp size={14} />
        ) : icone === "baixo" ? (
          <ChevronDown size={14} />
        ) : (
          <Trash2 size={14} />
        )
      }
    />
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
                <GripVertical size={16} />
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
                <BotaoAcaoLinha rotulo={`Subir ${nome}`} icone="cima" desabilitado={i === 0} aoClicar={() => aoAlterar({ stages: mover(etapas, i, i - 1) })} />
                <BotaoAcaoLinha rotulo={`Descer ${nome}`} icone="baixo" desabilitado={i === etapas.length - 1} aoClicar={() => aoAlterar({ stages: mover(etapas, i, i + 1) })} />
                <BotaoAcaoLinha rotulo={`Excluir ${nome}`} icone="lixeira" perigo desabilitado={etapas.length === 1} aoClicar={() => excluir(i)} />
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
                  <Button variant="danger" size="sm" onClick={() => confirmarExclusao(i)}>
                    Excluir e mover
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setExcluindo(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <Button
        variant="secondary"
        size="sm"
        icon={<IconPlus />}
        className="adicionar-linha-btn"
        disabled={etapas.length >= 20}
        onClick={() => aoAlterar({ stages: [...etapas, { chave: novaChave(), name: "", color: "#94A3B8", staleAfterDays: null }] })}
      >
        Adicionar etapa
      </Button>
      <p className="dica">Arraste pela alça ou use as setas para reordenar. Passado o prazo de parado, o negócio ganha um alerta no quadro; em branco, não alerta.</p>
    </div>
  );
}

export function SecaoEtiquetas({ rascunho, aoAlterar, erros }: PropsDaSecao) {
  const etiquetas = rascunho.tags;
  const alterar = (i: number, parcial: Partial<(typeof etiquetas)[number]>) =>
    aoAlterar({ tags: etiquetas.map((etiqueta, j) => (j === i ? { ...etiqueta, ...parcial } : etiqueta)) });

  return (
    <div className="secao-lista">
      <div className="secao-etiquetas-topo">
        <p className="dica">As etiquetas pertencem ao pipeline e aparecem nos cards e nos filtros.</p>
        <Button
          variant="primary"
          size="sm"
          icon={<IconPlus />}
          className="botao-nova-etiqueta"
          onClick={() => aoAlterar({ tags: [...etiquetas, { chave: novaChave(), name: "", color: "#0077FF" }] })}
        >
          Nova etiqueta
        </Button>
      </div>
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
              <BotaoAcaoLinha rotulo={`Excluir etiqueta ${etiqueta.name || i + 1}`} icone="lixeira" perigo aoClicar={() => aoAlterar({ tags: etiquetas.filter((_, j) => j !== i) })} />
            </span>
          </li>
        ))}
      </ul>
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
            <Switch
              label="Pede data para revisitar"
              checked={motivo.asksRevisitDate}
              onChange={(e) => alterar(i, { asksRevisitDate: e.target.checked })}
            />
            <span className="acoes-linha">
              <BotaoAcaoLinha rotulo={`Excluir motivo ${motivo.name || i + 1}`} icone="lixeira" perigo aoClicar={() => aoAlterar({ lossReasons: motivos.filter((_, j) => j !== i) })} />
            </span>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        icon={<IconPlus />}
        className="adicionar-linha-btn"
        onClick={() => aoAlterar({ lossReasons: [...motivos, { chave: novaChave(), name: "", asksRevisitDate: false }] })}
      >
        Novo motivo
      </Button>
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
    .map((m) => ({ id: m.userId, name: nomesDaEquipe[m.userId] ?? "Pessoa fora do CRM" }));
  const linhas = [...(pessoas ?? []), ...foraDaLista];
  const semPapel = (pessoas ?? []).filter((p) => !papelDe.has(p.id));

  function definir(pessoaId: string, papel: PipelineMemberRole | "") {
    const outros = rascunho.members.filter((m) => m.userId !== pessoaId);
    aoAlterar({ members: papel ? [...outros, { userId: pessoaId, role: papel }] : outros });
  }

  return (
    <div className="secao-lista">
      <p className="dica">
        Pessoas ativas do CRM. O <b>vendedor</b> vê o pipeline e todos os negócios dele; o <b>gestor</b> também altera esta
        configuração. O gerente do CRM e o admin já alcançam todos os pipelines.
      </p>
      <ErroDaLista texto={erros.members} />
      <ErroDaLista texto={falha ?? undefined} />
      {pessoas === null && !falha ? <p className="lista-vazia">Carregando pessoas…</p> : null}
      {pessoas !== null && linhas.length === 0 ? <p className="lista-vazia">Ninguém do CRM ainda.</p> : null}
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
        <Button
          variant="secondary"
          icon={<IconPlus />}
          className="adicionar-linha-btn"
          onClick={() => aoAlterar({ members: [...rascunho.members, ...semPapel.map((p) => ({ userId: p.id, role: "vendedor" as const }))] })}
        >
          Incluir todos como vendedores
        </Button>
      ) : null}
    </div>
  );
}
