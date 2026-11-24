"use client";

import {
  ROTULO_DA_CATEGORIA_DE_DOCUMENTO,
  type CategoriaDeDocumentoDeObra,
  type DocumentoDaObra,
  type MarcoDaObra,
  type Obra,
  type OpcoesDasObrasResposta,
} from "@plugga/shared";
import { CalendarClock, CalendarRange, Check, Download, FileText, Flag, FolderOpen, HardHat, History, Pencil, Upload, UserRound, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar, lerErro } from "../../lib/clientes";
import { dataEmManaus, diaLegivel, tamanhoDoArquivo, valorEmReais } from "../../lib/compras";
import { potenciaDaObra, problemaDoDocumento } from "../../lib/obras";
import { hrefDasOrdens, ROTULO_DA_SITUACAO, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import { urlDaApi } from "../../lib/usinas";
import fichaCompras from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, FileDropzone } from "../ui";
import obras from "./obras.module.css";
import { ObraForm } from "./obra-form";
import styles from "./usinas.module.css";

type Aba = "marcos" | "documentos" | "os";
type Anexo = { categoria?: CategoriaDeDocumentoDeObra; substitui?: DocumentoDaObra };

/**
 * Ficha da obra (PLU-350): os 6 marcos em sequência ("Marcar como feito" só no
 * próximo, a partir do início; "Reprogramar" no pendente, dentro do período), os documentos com versões (o cronograma do MS
 * Project primeiro) e as O.S. da obra. Os custos são do Financeiro.
 */
export function FichaDaObra({ obra: inicial, opcoes, hoje, aoFechar, aoAtualizar }: {
  obra: Obra;
  opcoes: OpcoesDasObrasResposta | null;
  hoje: string;
  aoFechar: () => void;
  aoAtualizar: () => void;
}) {
  const id = useId();
  const [o, setO] = useState(inicial);
  const [aba, setAba] = useState<Aba>("marcos");
  const [janela, setJanela] = useState<null | "editar" | Anexo>(null);
  const [reprogramando, setReprogramando] = useState<MarcoDaObra | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const pode = (a: Obra["acoesPermitidas"][number]) => o.acoesPermitidas.includes(a);
  const kwp = potenciaDaObra(o.potenciaKwp);
  const cronograma = o.documentosDaObra.find((d) => d.categoria === "cronograma") ?? null;
  const outros = o.documentosDaObra.filter((d) => d.categoria !== "cronograma");
  const antesDoInicio = Boolean(o.inicioEm && hoje < o.inicioEm);
  // Reprogramar só com o período da obra e a entrega ainda por vir (a nova data não vai ao passado).
  const reprograma = pode("reprogramar_marco") && Boolean(o.inicioEm && o.entregaPrevistaEm && o.entregaPrevistaEm >= hoje);

  const abas: { id: Aba; titulo: string; conta?: number; icone: LucideIcon }[] = [
    { id: "marcos", titulo: "Marcos", icone: Flag },
    { id: "documentos", titulo: "Documentos", conta: o.documentosDaObra.length, icone: FolderOpen },
    { id: "os", titulo: "O.S.", conta: o.ordens.length, icone: Wrench },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }
  function atualizada(nova: Obra, texto: string) { setO(nova); setFalha(null); setAviso(texto); aoAtualizar(); }

  async function marcarFeito(marcoId: string, nome: string) {
    setOcupado(true); setFalha(null);
    const r = await enviar<Obra>(`/api/engenharia/obras/${o.id}/marcos/${marcoId}/feito`, "POST", {});
    setOcupado(false);
    if (r.ok) atualizada(r.dados, `Marco "${nome}" feito.`); else setFalha(r.erro.mensagem);
  }

  return <><Modal rotulo={o.nome} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}><div className={detalhes.leadCardLinhaSuperior}>
          <div className={detalhes.iconeLead} aria-hidden="true"><HardHat size={20} /></div>
          <div className={detalhes.identidadeLead}>
            <h2 className={detalhes.leadCardTitulo}>{o.nome}</h2>
            <div className={detalhes.metadadosCabecalho}>
              <span className={fichaCompras.empresaCabecalho}><EmpresaComPonto empresa={o.empresa} /></span>
              {o.cliente ? <><span aria-hidden="true">·</span><span>{o.cliente.nome}</span></> : null}
              {kwp ? <><span aria-hidden="true">·</span><span><Zap size={13} aria-hidden="true" />{kwp}</span></> : null}
              <span aria-hidden="true">·</span><span><UserRound size={13} aria-hidden="true" />{o.responsavel?.nome ?? "Sem responsável"}</span>
              {o.ativa ? null : <><span aria-hidden="true">·</span><span>inativa</span></>}
            </div>
          </div>
        </div></div>
        <div className={detalhes.controlesCabecalho}>
          {pode("editar") ? <Button variant="secondary" size="sm" icon={<Pencil size={14} />} disabled={ocupado} onClick={() => setJanela("editar")}>Editar</Button> : null}
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} disabled={ocupado} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} ${fichaCompras.abas} plg-parte`} role="tablist" aria-label="Seções da obra" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`}
              aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span>{a.titulo}{a.conta !== undefined ? <span className={fichaCompras.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${fichaCompras.painel} plg-parte`}>
          {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
          {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}

          {aba === "marcos" ? <div className={visao.resumo}>
            <section aria-label="Marcos da obra" className={visao.indicadores}>
              <header className={visao.identidade}>
                <span className={visao.iconeNegocio} aria-hidden="true"><HardHat size={18} /></span>
                <div className={visao.identidadeTexto}>
                  <p className={visao.muted}>{o.inicioEm ? `Início ${diaLegivel(o.inicioEm)}` : "Sem início"} · {o.entregaPrevistaEm ? `entrega prevista ${diaLegivel(o.entregaPrevistaEm)}` : "sem entrega prevista"}</p>
                  <span className={visao.etapaAtual}>{o.marcos.feitos} de {o.marcos.total} marcos</span>
                </div>
                {o.orcamento ? <div className={`${visao.valor} ${fichaCompras.valorDoPedido}`}><span>{valorEmReais(o.orcamento)}</span><small>orçamento</small></div> : null}
              </header>
            </section>
            {o.marcosDaObra.length === 0 ? <p className={fichaCompras.muted}>A obra ainda não tem marcos: eles nascem com o início e a entrega prevista.</p>
              : <ol className={obras.listaDeMarcos} aria-label="Marcos, na ordem">
                {o.marcosDaObra.map((m) => <li key={m.id} data-feito={m.feito ? true : undefined} data-proximo={m.proximo || undefined} aria-current={m.proximo ? "step" : undefined}>
                  <span className={obras.ponto} aria-hidden="true">{m.feito ? <Check size={13} /> : m.ordem}</span>
                  <span className={obras.textoDoMarco}>
                    <strong>{m.nome}</strong>
                    <small>{m.feito ? <>Feito em {dataEmManaus(m.feito.em)}{m.feito.por ? ` · ${m.feito.por.nome}` : ""}{m.atrasado ? <> · <span className={styles.perigo}>depois do previsto ({diaLegivel(m.previstoEm)})</span></> : null}</>
                      : <>Previsto para {diaLegivel(m.previstoEm)}{m.atrasado ? <> · <span className={styles.perigo}>atrasado</span></> : null}</>}</small>
                  </span>
                  {!m.feito && reprograma ? <Button variant="secondary" size="sm" icon={<CalendarClock size={14} />} disabled={ocupado} aria-label={`Reprogramar ${m.nome}`} onClick={() => setReprogramando(m)}>Reprogramar</Button> : null}
                  {m.proximo && pode("marcar_marco") ? <Button size="sm" icon={<Check size={14} />} disabled={ocupado || antesDoInicio} title={antesDoInicio ? `A obra começa em ${diaLegivel(o.inicioEm!)}` : undefined}
                    onClick={() => void marcarFeito(m.id, m.nome)}>Marcar como feito</Button> : null}
                </li>)}
              </ol>}
            {antesDoInicio ? <p className={obras.nota}><CalendarRange size={14} aria-hidden="true" />A obra começa em {diaLegivel(o.inicioEm!)}: os marcos só podem ser feitos a partir do início.</p> : null}
            <p className={obras.nota}><FileText size={14} aria-hidden="true" />As datas de cada tarefa ficam no cronograma do MS Project, anexado na aba Documentos. Aqui ficam só os marcos.</p>
          </div> : null}

          {aba === "documentos" ? <div className={fichaCompras.secao}>
            <div className={fichaCompras.barra}><div><h3>Documentos</h3><p>EVTE, RVT, GRD, atas, projeto elétrico e o cronograma, com as versões anteriores.</p></div>
              {pode("anexar") ? <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => setJanela({})}>Anexar</Button> : null}</div>
            <ul className={obras.documentos}>
              {cronograma ? <Documento documento={cronograma} icone={CalendarRange} aoNovaVersao={pode("anexar") ? () => setJanela({ categoria: "cronograma", substitui: cronograma }) : undefined} />
                : <li className={obras.documento}><div className={obras.linhaDoDocumento}>
                  <span className={obras.iconeDoDocumento} aria-hidden="true"><CalendarRange size={16} /></span>
                  <span className={obras.textoDoDocumento}><strong>Sem cronograma</strong><small>Anexe o arquivo do MS Project (.mpp)</small></span>
                  {pode("anexar") ? <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => setJanela({ categoria: "cronograma" })}>Anexar cronograma</Button> : null}
                </div></li>}
              {outros.map((d) => <Documento key={d.id} documento={d} icone={FileText} aoNovaVersao={pode("anexar") ? () => setJanela({ categoria: d.categoria, substitui: d }) : undefined} />)}
            </ul>
          </div> : null}

          {aba === "os" ? <div className={fichaCompras.secao}>
            <div className={fichaCompras.barra}><div><h3>O.S. da obra</h3><p>Instalação, comissionamento e visitas ligadas a esta obra.</p></div></div>
            {o.ordens.length === 0 ? <p className={fichaCompras.muted}>Nenhuma O.S. ligada a esta obra.</p>
              : <ul className={styles.historico}>{o.ordens.map((x) => <li key={x.id}>
                <span className={styles.diaDoHistorico}><Link href={hrefDasOrdens({ visao: "cards" }, x.id)}>{x.codigo}</Link></span>
                <span className={styles.situacaoFeita}>{ROTULO_DA_SITUACAO[x.situacao as keyof typeof ROTULO_DA_SITUACAO] ?? x.situacao}</span>
                <span className={styles.textoDoHistorico}>{ROTULO_DO_TIPO[x.tipo as keyof typeof ROTULO_DO_TIPO] ?? x.tipo} · {x.descricao}<small>prazo {diaLegivel(x.prazo)}</small></span>
              </li>)}</ul>}
          </div> : null}
        </section>
      </div>
    </div>
  </Modal>
  {janela === "editar" ? <ObraForm obra={o} opcoes={opcoes} hoje={hoje} aoCancelar={() => setJanela(null)} aoSalvar={(nova) => { setJanela(null); atualizada(nova, "Obra atualizada."); }} /> : null}
  {reprogramando ? <ReprogramarMarco obra={o} marco={reprogramando} hoje={hoje} aoCancelar={() => setReprogramando(null)}
    aoSalvar={(nova, nome) => { setReprogramando(null); atualizada(nova, `Marco "${nome}" reprogramado.`); }} /> : null}
  {janela && janela !== "editar" ? <AnexarDocumento obraId={o.id} anexo={janela} categorias={opcoes?.categoriasDeDocumento} aoCancelar={() => setJanela(null)}
    aoEnviar={(nova, texto) => { setJanela(null); setAba("documentos"); atualizada(nova, texto); }} /> : null}
  </>;
}

function Documento({ documento: d, icone: Icone, aoNovaVersao }: { documento: DocumentoDaObra; icone: LucideIcon; aoNovaVersao?: () => void }) {
  return <li className={obras.documento}>
    <div className={obras.linhaDoDocumento}>
      <span className={obras.iconeDoDocumento} aria-hidden="true"><Icone size={16} /></span>
      <span className={obras.textoDoDocumento}>
        <strong title={d.nome}>{d.nome}{d.versao > 1 || d.categoria === "cronograma" ? ` · versão ${d.versao}` : ""}</strong>
        <small>{ROTULO_DA_CATEGORIA_DE_DOCUMENTO[d.categoria]}{d.protocolo ? ` · protocolo ${d.protocolo.numero}` : ""} · {tamanhoDoArquivo(d.tamanhoBytes)} · {d.enviado.por?.nome ?? "—"} · {dataEmManaus(d.enviado.em)}</small>
      </span>
      <span className={obras.acoesDoDocumento}>
        {aoNovaVersao ? <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={aoNovaVersao}>Nova versão</Button> : null}
        <a className={obras.baixar} href={urlDaApi(d.url)} target="_blank" rel="noopener noreferrer" aria-label={`Baixar ${d.nome}`}><Download size={14} aria-hidden="true" />Baixar</a>
      </span>
    </div>
    {d.versoesAnteriores.length ? <ul className={obras.versoes} aria-label={`Versões anteriores de ${d.nome}`}>
      {d.versoesAnteriores.map((v) => <li key={v.id}><History size={13} aria-hidden="true" />
        <span>Versão {v.versao} · {v.enviado.por?.nome ?? "—"} · {dataEmManaus(v.enviado.em)}</span>
        <a className={`${obras.baixar} ${obras.baixarPequeno}`} href={urlDaApi(v.url)} target="_blank" rel="noopener noreferrer" aria-label={`Baixar a versão ${v.versao}`}><Download size={13} aria-hidden="true" />Baixar</a>
      </li>)}
    </ul> : null}
  </li>;
}

/** A nova data do marco pendente: de hoje (ou do início, se ainda não começou) até a entrega prevista. */
function ReprogramarMarco({ obra, marco, hoje, aoCancelar, aoSalvar }: { obra: Obra; marco: MarcoDaObra; hoje: string; aoCancelar: () => void; aoSalvar: (o: Obra, nome: string) => void }) {
  const minimo = obra.inicioEm && obra.inicioEm > hoje ? obra.inicioEm : hoje;
  const maximo = obra.entregaPrevistaEm!;
  const [data, setData] = useState(marco.previstoEm >= minimo && marco.previstoEm <= maximo ? marco.previstoEm : "");
  const [erro, setErro] = useState<string | undefined>();
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const problema = !data ? "informe a nova data." : data < minimo || data > maximo ? `use uma data de ${diaLegivel(minimo)} a ${diaLegivel(maximo)}.` : undefined;
    setErro(problema);
    if (problema) return;
    if (data === marco.previstoEm) { aoCancelar(); return; }
    setEnviando(true); setFalha(null);
    const r = await enviar<Obra>(`/api/engenharia/obras/${obra.id}/marcos/${marco.id}`, "PATCH", { previstoEm: data });
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados, marco.nome); return; }
    setErro(r.erro.porCampo.previstoEm); setFalha(r.erro.mensagem);
  }

  return <Dialog title={`Reprogramar ${marco.nome}`} size="estreita" icon={<CalendarClock size={20} />} onClose={aoCancelar}
    description={`Previsto para ${diaLegivel(marco.previstoEm)}. A nova data fica entre ${diaLegivel(minimo)} e a entrega prevista, ${diaLegivel(maximo)}.`}
    footer={<Button type="submit" form="form-reprogramar-marco" icon={<CalendarClock size={15} />} disabled={enviando}>{enviando ? "Salvando…" : "Reprogramar"}</Button>}>
    <form id="form-reprogramar-marco" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <DatePicker label="Nova data prevista" required min={minimo} max={maximo} value={data} onChange={(v) => { setData(v); setErro(undefined); }} error={erro} />
    </form>
  </Dialog>;
}

/** Anexar documento ou nova versão: a categoria (fixa na nova versão) e o arquivo. */
function AnexarDocumento({ obraId, anexo, categorias, aoCancelar, aoEnviar }: {
  obraId: string;
  anexo: Anexo;
  categorias?: readonly CategoriaDeDocumentoDeObra[];
  aoCancelar: () => void;
  aoEnviar: (o: Obra, texto: string) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaDeDocumentoDeObra | "">(anexo.categoria ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erros, setErros] = useState<{ categoria?: string; arquivo?: string }>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fixa = Boolean(anexo.categoria);
  const titulo = anexo.substitui ? `Nova versão de ${anexo.substitui.nome}` : anexo.categoria === "cronograma" ? "Anexar cronograma" : "Anexar documento";

  async function enviarArquivo(evento: FormEvent) {
    evento.preventDefault();
    const problemas = { categoria: categoria ? undefined : "escolha o tipo do documento.", arquivo: arquivo ? problemaDoDocumento(arquivo) ?? undefined : "escolha o arquivo." };
    setErros(problemas);
    if (problemas.categoria || problemas.arquivo) return;
    const form = new FormData();
    form.set("arquivo", arquivo!);
    form.set("categoria", categoria);
    if (anexo.substitui) form.set("substitui", anexo.substitui.id);
    setEnviando(true); setFalha(null);
    try {
      const resposta = await fetch(`/api/engenharia/obras/${obraId}/documentos`, { method: "POST", body: form });
      const dados = await resposta.json().catch(() => null);
      setEnviando(false);
      if (resposta.ok) {
        const nova = dados as Obra;
        // No cronograma, a versão nova é automática: o atual vira o anterior.
        const doc = anexo.substitui ? nova.documentosDaObra.find((d) => d.serieId === anexo.substitui!.serieId) : nova.documentosDaObra.find((d) => d.categoria === categoria && d.nome === arquivo!.name);
        aoEnviar(nova, doc && doc.versao > 1 ? `${ROTULO_DA_CATEGORIA_DE_DOCUMENTO[doc.categoria]} na versão ${doc.versao}; a anterior ficou no histórico.` : "Documento anexado à obra.");
        return;
      }
      const erro = lerErro(dados, "Não foi possível enviar o arquivo. Tente de novo.");
      setErros({ categoria: erro.porCampo.categoria, arquivo: erro.porCampo.arquivo });
      setFalha(erro.mensagem);
    } catch {
      setEnviando(false);
      setFalha("Sem conexão com o servidor. Tente de novo.");
    }
  }

  return <Dialog title={titulo} size="estreita" icon={<Upload size={20} />} onClose={aoCancelar}
    description={anexo.substitui ? "A versão atual vai para o histórico; nada é apagado." : "PDF, imagem ou o arquivo do MS Project (.mpp), até 50 MB."}
    footer={<Button type="submit" form="form-documento-obra" icon={<Upload size={15} />} disabled={enviando}>{enviando ? "Enviando…" : "Enviar"}</Button>}>
    <form id="form-documento-obra" className="ui-dialog-form" onSubmit={enviarArquivo} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <CampoDeMenu label="Tipo do documento" required icon={<FileText />} placeholder="Selecione o tipo" value={categoria || undefined} disabled={fixa}
        onChange={(v) => { setCategoria(v as CategoriaDeDocumentoDeObra); setErros((e) => ({ ...e, categoria: undefined })); }} error={erros.categoria}
        options={(categorias ?? Object.keys(ROTULO_DA_CATEGORIA_DE_DOCUMENTO) as CategoriaDeDocumentoDeObra[]).map((c) => ({ value: c, label: ROTULO_DA_CATEGORIA_DE_DOCUMENTO[c], icon: c === "cronograma" ? <CalendarRange /> : <FileText /> }))} />
      <div>
        <FileDropzone label="Arquivo (obrigatório): PDF, JPG, PNG ou .mpp" value={arquivo ? [arquivo] : []} disabled={enviando}
          onChange={(xs) => { setArquivo(xs.at(-1) ?? null); setErros((e) => ({ ...e, arquivo: undefined })); }} />
        {erros.arquivo ? <p className="ui-field-error" role="alert">Erro: {erros.arquivo}</p> : null}
      </div>
    </form>
  </Dialog>;
}
