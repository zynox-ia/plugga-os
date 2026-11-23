"use client";

import { situacoesDoMonitoramento, type CardDePlataforma, type MonitoramentoDoDia, type SituacaoDoMonitoramento } from "@plugga/shared";
import { Activity, Check, CircleAlert, Eye, Monitor, Paperclip, TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties, type FormEvent } from "react";

import { lerErro } from "../../lib/clientes";
import { diaPorExtenso } from "../../lib/engenharia";
import { horarioEmManaus, hrefDasOrdens } from "../../lib/ordens-de-servico";
import {
  contagemDeUsinas,
  kwpLegivel,
  linhaDaConferencia,
  mudarSituacao,
  resultadosDaConferencia,
  ROTULO_DA_SITUACAO_DO_MONITORAMENTO,
  urlDaApi,
  type MarcacaoDaUsina,
  type ProblemasDaConferencia,
} from "../../lib/usinas";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Checkbox, Dialog, FileDropzone, TextField } from "../ui";
import styles from "./usinas.module.css";

const ICONE_DA_SITUACAO = { normal: Activity, anomalia: TriangleAlert, sem_comunicacao: WifiOff } as const;
const chaveDoCard = (c: Pick<CardDePlataforma, "plataforma" | "empresa">) => `${c.plataforma.id}:${c.empresa}`;

/**
 * Monitoramento de hoje (PLU-347): "5 de 9 plataformas conferidas", um card por
 * plataforma e empresa (as pendentes primeiro, na ordem da API) e a conferência
 * num modal, com o print obrigatório.
 */
export function MonitoramentoDoDiaView({ dia, aoConferir }: { dia: MonitoramentoDoDia; aoConferir: (aviso: string) => void }) {
  const [aberto, setAberto] = useState<CardDePlataforma | null>(null);
  const r = dia.resumo;
  const proxima = dia.cards.find((c) => !c.conferencia);

  if (dia.cards.length === 0) return <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true"><Monitor size={22} /></div>
    <h3 className="lista-negocios-vazia-titulo">Nenhuma plataforma para conferir hoje</h3>
    <p className="lista-negocios-vazia-desc">O monitoramento aparece quando houver usinas ativas cadastradas, uma conferência por plataforma e empresa por dia.</p>
  </div>;

  return <div className={styles.monitoramento}>
    <section className={styles.resumo} aria-label="Resumo do monitoramento de hoje">
      <div className={styles.resumoTexto}>
        <p className={styles.muted}><Activity size={14} aria-hidden="true" />{diaPorExtenso(dia.hoje)} · {contagemDeUsinas(r.usinas)} em {r.total} {r.total === 1 ? "plataforma" : "plataformas"}</p>
        <h2>{r.conferidas} de {r.total} {r.total === 1 ? "plataforma conferida" : "plataformas conferidas"}</h2>
        <div className={styles.progresso} role="progressbar" aria-label="Plataformas conferidas hoje" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.conferidas}>
          <span style={{ width: `${r.total ? (r.conferidas / r.total) * 100 : 0}%` }} />
        </div>
      </div>
      <dl className={styles.contadores}>
        <div><dt>Normais</dt><dd>{r.normais}</dd></div>
        <div><dt>Anomalias</dt><dd className={r.anomalias ? styles.perigo : undefined}>{r.anomalias}</dd></div>
        <div><dt>Sem comunicação</dt><dd className={r.semComunicacao ? styles.perigo : undefined}>{r.semComunicacao}</dd></div>
      </dl>
      {proxima && dia.podeConferir ? <Button icon={<Activity size={15} />} onClick={() => setAberto(proxima)}>Conferir {proxima.plataforma.nome}</Button> : null}
    </section>

    <div className={styles.grade}>
      {dia.cards.map((c, i) => {
        const conf = c.conferencia;
        return <article key={chaveDoCard(c)} className={`${styles.card} ${styles.entra}`} style={{ "--i": i } as CSSProperties} aria-label={`${c.plataforma.nome}, ${conf ? "conferida" : "pendente"}`}>
          <header className={styles.cardTopo}>
            <span className={styles.caixa} aria-hidden="true"><Monitor size={20} /></span>
            <span className={styles.canto}>{contagemDeUsinas(c.usinas.length)}<span aria-hidden="true">·</span><EmpresaComPonto empresa={c.empresa} curto /></span>
          </header>
          <div className={styles.cardCorpo}>
            <h3>{c.plataforma.nome}</h3>
            <p className={styles.muted}>{linhaDaConferencia(c)}</p>
          </div>
          {conf && conf.excecoes.length ? <ul className={styles.excecoes}>{conf.excecoes.map((x) => {
            const Icone = ICONE_DA_SITUACAO[x.situacao];
            return <li key={x.usinaId}><Icone size={14} aria-hidden="true" /><span><strong>{x.usina}</strong><small>{ROTULO_DA_SITUACAO_DO_MONITORAMENTO[x.situacao]}{x.ordem ? <> · <Link href={hrefDasOrdens({ visao: "cards" }, x.ordem.id)}>{x.ordem.codigo}</Link></> : null}</small></span></li>;
          })}</ul> : <p className={styles.usinasDoCard} title={c.usinas.map((u) => u.cliente).join(", ")}>{conf ? `${contagemDeUsinas(conf.normais)} ${conf.normais === 1 ? "normal" : "normais"}` : c.usinas.map((u) => u.cliente).join(", ")}</p>}
          <footer className={styles.cardRodape}>
            <span className={styles.duasLinhas}><span>{conf ? horarioEmManaus(conf.conferida.em) : "Pendente"}</span><small>{conf ? "conferida" : "conferir hoje"}</small></span>
            <span className={styles.espaco} />
            {conf ? <>
              <a href={urlDaApi(conf.print.url)} target="_blank" rel="noopener noreferrer" className={styles.anexo} aria-label={`Print da conferência de ${c.plataforma.nome}`} title="Ver o print"><Paperclip size={14} aria-hidden="true" /></a>
              {conf.excecoes.length ? <span className={styles.pilula}>{conf.excecoes.length} {conf.excecoes.length === 1 ? "exceção" : "exceções"}</span> : null}
              <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.redondo} aria-label={`Ver a conferência de ${c.plataforma.nome}`} title="Ver a conferência" onClick={() => setAberto(c)} />
            </> : dia.podeConferir ? <Button size="sm" iconOnly icon={<Activity size={15} />} className={styles.redondo} aria-label={`Conferir ${c.plataforma.nome}`} title="Conferir" onClick={() => setAberto(c)} /> : null}
          </footer>
        </article>;
      })}
    </div>

    {aberto ? (aberto.conferencia
      ? <ConferenciaFeita card={aberto} aoFechar={() => setAberto(null)} />
      : <ConferirPlataforma card={aberto} podeAbrirOs={dia.podeAbrirOs} aoCancelar={() => setAberto(null)}
        aoConferir={(novo) => {
          const card = novo.cards.find((x) => chaveDoCard(x) === chaveDoCard(aberto));
          const ordens = card?.conferencia?.excecoes.flatMap((x) => (x.ordem ? [x.ordem.codigo] : [])) ?? [];
          setAberto(null);
          aoConferir(ordens.length ? `${aberto.plataforma.nome} conferida. ${ordens.join(", ")} ${ordens.length === 1 ? "aberta" : "abertas"} a partir do monitoramento.`
            : card?.conferencia?.excecoes.length ? `${aberto.plataforma.nome} conferida, com ${card.conferencia.excecoes.length} ${card.conferencia.excecoes.length === 1 ? "exceção" : "exceções"}.` : `${aberto.plataforma.nome} conferida: tudo normal.`);
        }} />) : null}
  </div>;
}

/** A conferência: cada usina como Normal, Anomalia ou Sem comunicação; só as exceções vão, com nota; o print é obrigatório. */
function ConferirPlataforma({ card, podeAbrirOs, aoCancelar, aoConferir }: { card: CardDePlataforma; podeAbrirOs: boolean; aoCancelar: () => void; aoConferir: (d: MonitoramentoDoDia) => void }) {
  const [marcacoes, setMarcacoes] = useState<Record<string, MarcacaoDaUsina>>(() => Object.fromEntries(card.usinas.map((u) => [u.id, { situacao: "normal", nota: "", abrirOs: false }])));
  const [print, setPrint] = useState<File | null>(null);
  const [problemas, setProblemas] = useState<ProblemasDaConferencia>({ notas: {} });
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const marcar = (usinaId: string, m: MarcacaoDaUsina) => { setMarcacoes((x) => ({ ...x, [usinaId]: m })); setProblemas((p) => ({ ...p, notas: { ...p.notas, [usinaId]: "" } })); };

  async function conferir(evento: FormEvent) {
    evento.preventDefault();
    const { problemas: novos, resultados } = resultadosDaConferencia(marcacoes, print);
    setProblemas(novos);
    if (!resultados || !print) return;
    const form = new FormData();
    form.set("empresa", card.empresa);
    form.set("resultados", JSON.stringify(resultados.map((r) => ({ usinaId: r.usinaId, situacao: r.situacao, nota: r.nota, ...(r.abrirOs ? { abrirOs: true } : {}) }))));
    form.set("print", print);
    setEnviando(true); setFalha(null);
    try {
      const resposta = await fetch(`/api/engenharia/monitoramento/${card.plataforma.id}/conferir`, { method: "POST", body: form });
      const dados = await resposta.json().catch(() => null);
      if (resposta.ok) { aoConferir(dados as MonitoramentoDoDia); return; }
      setFalha(lerErro(dados, "Não foi possível concluir a conferência. Tente de novo.").mensagem);
    } catch {
      setFalha("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return <Dialog title={`Conferir ${card.plataforma.nome}`} size="media" icon={<Activity size={20} />} onClose={aoCancelar}
    description={`${contagemDeUsinas(card.usinas.length)} da ${card.empresa === "waze" ? "Waze Energia" : "Plugga"} nesta plataforma. Marque só o que fugiu do normal e anexe o print.`}
    footer={<Button type="submit" form="form-conferir" icon={<Check size={15} />} disabled={enviando}>{enviando ? "Enviando…" : "Concluir conferência"}</Button>}>
    <form id="form-conferir" className="ui-dialog-form" onSubmit={conferir} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <ul className={styles.linhasDaConferencia}>{card.usinas.map((u) => {
        const m = marcacoes[u.id]!;
        return <li key={u.id}>
          <div className={styles.linhaDaUsina}>
            <span className={styles.usinaDaLinha}><strong>{u.nome}</strong><small>{u.cliente} · {kwpLegivel(u.potenciaKwp)} kWp{u.fabricante ? ` · ${u.fabricante}` : ""}</small></span>
            <div className={styles.situacaoDaLinha}>
              <CampoDeMenu label={`Situação de ${u.nome}`} icon={<Activity />} value={m.situacao} onChange={(v) => marcar(u.id, mudarSituacao(m, v as SituacaoDoMonitoramento, podeAbrirOs))}
                options={situacoesDoMonitoramento.map((s) => { const Icone = ICONE_DA_SITUACAO[s]; return { value: s, label: ROTULO_DA_SITUACAO_DO_MONITORAMENTO[s], icon: <Icone /> }; })} />
            </div>
          </div>
          {m.situacao !== "normal" ? <div className={styles.extraDaLinha}>
            <TextField label="O que foi visto" required maxLength={1000} value={m.nota} onChange={(e) => marcar(u.id, { ...m, nota: e.target.value })}
              error={problemas.notas[u.id] || undefined} placeholder={m.situacao === "anomalia" ? "Ex.: geração 40% abaixo do bloco A desde sexta" : "Ex.: sem dados na plataforma desde ontem"} />
            {podeAbrirOs ? <Checkbox label={m.situacao === "anomalia" ? "Abrir O.S. de manutenção" : "Abrir O.S."} description="Já preenchida, com a origem monitoramento" checked={m.abrirOs} onChange={(e) => marcar(u.id, { ...m, abrirOs: e.target.checked })} /> : null}
          </div> : null}
        </li>;
      })}</ul>
      <div className="ui-field">
        <FileDropzone label="Print da plataforma (obrigatório): a tela com as usinas, como hoje (JPG, PNG ou PDF)" value={print ? [print] : []}
          onChange={(xs) => { setPrint(xs.at(-1) ?? null); setProblemas((p) => ({ ...p, print: undefined })); }} disabled={enviando} />
        {problemas.print ? <p className="ui-field-error" role="alert">Erro: {problemas.print}</p> : null}
      </div>
    </form>
  </Dialog>;
}

/** A conferência fechada não muda (P1): mostra quem, quando, o print e as exceções. */
function ConferenciaFeita({ card, aoFechar }: { card: CardDePlataforma; aoFechar: () => void }) {
  const c = card.conferencia!;
  return <Dialog title={`Conferência ${card.plataforma.nome}`} size="media" icon={<Activity size={20} />} onClose={aoFechar} cancelText="Fechar"
    description={`${linhaDaConferencia(card)} · ${card.empresa === "waze" ? "Waze Energia" : "Plugga"}`}>
    <div className={styles.conferenciaFeita}>
      <ul className={styles.linhasDaConferencia}>{card.usinas.map((u) => {
        const x = c.excecoes.find((e) => e.usinaId === u.id);
        const situacao = x?.situacao ?? "normal";
        return <li key={u.id}><div className={styles.linhaDaUsina}>
          <span className={styles.usinaDaLinha}><strong>{u.nome}</strong><small>{u.cliente} · {kwpLegivel(u.potenciaKwp)} kWp</small>{x?.nota ? <small className={styles.nota}>{x.nota}</small> : null}</span>
          <span className={styles.situacaoFeita} data-situacao={situacao}>{situacao === "normal" ? <Check size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}{ROTULO_DA_SITUACAO_DO_MONITORAMENTO[situacao]}{x?.ordem ? <> · <Link href={hrefDasOrdens({ visao: "cards" }, x.ordem.id)}>{x.ordem.codigo}</Link></> : null}</span>
        </div></li>;
      })}</ul>
      <a className={styles.linkDoPrint} href={urlDaApi(c.print.url)} target="_blank" rel="noopener noreferrer"><Paperclip size={14} aria-hidden="true" />{c.print.nome}</a>
      <p className={styles.muted}>A conferência fechada não muda. Uma anomalia nova entra na conferência de amanhã ou numa O.S.</p>
    </div>
  </Dialog>;
}
