"use client";

import { formasDoLancamento, type AcaoDoLancamento, type FormaDoLancamento, type Lancamento, type OpcoesDoFinanceiro, type TipoDeAnexo } from "@plugga/shared";
import { ArrowDownLeft, Barcode, CheckCircle2, Clock, CreditCard, FileText, Landmark, MessageSquare, Paperclip, Pencil, Send, Wallet, type LucideIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { dataEmManaus, diaLegivel, ROTULO_DA_EMPRESA, tamanhoDoArquivo, urlDoArquivo, valorEmReais } from "../../lib/compras";
import {
  boletoNovoNaCorrecao,
  CANAIS_DE_CONTATO,
  contasDaEmpresa,
  corpoDaCorrecao,
  corpoDoPagamento,
  corpoDoRecebimento,
  problemaDoAnexo,
  ROTULO_DA_FORMA,
  textoDaAcao,
  valorEmDigitacao,
} from "../../lib/ficha-do-lancamento";
import { detalheDaConta } from "../../lib/configuracoes-do-financeiro";
import estilosFicha from "../compras/ficha-do-pedido.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, FileDropzone, TextField, TextareaField } from "../ui";
import styles from "./ficha.module.css";

type Agir = (acao: AcaoDoLancamento) => Promise<boolean>;
/** Anexa e devolve o problema, ou nulo. */
type Anexar = (tipo: TipoDeAnexo, arquivo: File) => Promise<string | null>;

function Destaque({ icone: Icone, titulo, tom, children }: { icone: LucideIcon; titulo: string; tom?: "perigo" | "ok"; children: ReactNode }) {
  return <section className={`${visao.destaque} ${estilosFicha.acao} ${tom === "perigo" ? estilosFicha.acaoPerigo : tom === "ok" ? estilosFicha.acaoOk : ""}`} aria-label={titulo}>
    <h3><Icone size={15} aria-hidden="true" />{titulo}</h3>
    {children}
  </section>;
}

/** Link para baixar um anexo já guardado no lançamento. */
function LinkDoAnexo({ anexo }: { anexo: NonNullable<Lancamento["comprovanteAtual"]> }) {
  return <a className={estilosFicha.anexo} href={urlDoArquivo(anexo.url)} target="_blank" rel="noopener noreferrer"><Paperclip size={13} aria-hidden="true" /><span>{anexo.nomePadronizado ?? anexo.nome}</span></a>;
}

const atual = (l: Lancamento, tipo: TipoDeAnexo) => l.arquivos.find((a) => a.tipo === tipo && !a.substituido) ?? null;
const contasDoMenu = (opcoes: OpcoesDoFinanceiro | null, l: Lancamento) =>
  opcoes ? contasDaEmpresa(opcoes, l.empresa, l.contaCorrente?.id).map((c) => ({ value: c.id, label: c.nome, ...(detalheDaConta(c) ? { description: detalheDaConta(c) } : {}), icon: <Landmark /> })) : [];
const canais = CANAIS_DE_CONTATO.map((c) => ({ value: c, label: c, icon: <MessageSquare /> }));

/** O arquivo do campo: o atual (com link) e o seletor para anexar ou trocar. */
function CampoDoArquivo({ rotulo, obrigatorio, anexoAtual, arquivo, aoMudar, erro, disabled }: {
  rotulo: string; obrigatorio: boolean; anexoAtual: Lancamento["comprovanteAtual"]; arquivo: File[]; aoMudar: (f: File[]) => void; erro?: string; disabled: boolean;
}) {
  return <div className={styles.campoDoArquivo}>
    {anexoAtual ? <div className={estilosFicha.arquivoPendente}><LinkDoAnexo anexo={anexoAtual} /><span className={estilosFicha.muted}>{tamanhoDoArquivo(anexoAtual.tamanhoBytes)} · já anexado</span></div> : null}
    <FileDropzone label={anexoAtual ? `Trocar ${rotulo.toLowerCase()} (opcional)` : `${rotulo}${obrigatorio ? "" : " (opcional)"}, PDF ou imagem até 25 MB`} value={arquivo} disabled={disabled}
      onChange={(arquivos) => aoMudar(arquivos.slice(-1))} />
    {erro ? <p className="ui-field-error" role="alert">{erro}</p> : null}
  </div>;
}

/**
 * O bloco da etapa atual na visão geral (PLU-337), como no protótipo: o que fazer
 * agora e, no pagamento, no boleto e no envio, os campos que o botão principal do
 * rodapé envia (`formId`). NF, recebimento e correção de valor abrem diálogos.
 */
export function AcaoDaEtapaDoLancamento({ l, opcoes, ocupado, hoje, formId, aoAgir, aoAnexar }: {
  l: Lancamento; opcoes: OpcoesDoFinanceiro | null; ocupado: boolean; hoje: string; formId: string; aoAgir: Agir; aoAnexar: Anexar;
}) {
  const pode = (a: Lancamento["acoesPermitidas"][number]) => l.acoesPermitidas.includes(a);
  const empresa = ROTULO_DA_EMPRESA[l.empresa];
  if (l.cancelado) return null;
  switch (l.etapa) {
    case "aberta": return pode("aprovar") ? <Destaque icone={CheckCircle2} titulo="Aprovação">
      <p>Confira e aprove. Aprovada, a conta segue para o pagamento e vai ao OMIE da {empresa}.</p>
    </Destaque> : null;
    case "aprovada": return pode("registrar_pagamento") ? <Destaque icone={Wallet} titulo="Registrar pagamento">
      <p>{valorEmReais(l.valor)} para <strong>{l.favorecido.nome}</strong>. O comprovante fica guardado no lançamento, no armazenamento do Plugga OS.</p>
      <FormDoPagamento l={l} opcoes={opcoes} ocupado={ocupado} hoje={hoje} formId={formId} aoAgir={aoAgir} aoAnexar={aoAnexar} />
    </Destaque> : null;
    case "paga": return <Destaque icone={CheckCircle2} titulo="Pagamento registrado" tom="ok">
      <p>{l.marcos.pago ? `Pago em ${diaLegivel(l.marcos.pago.pagoEm)}${l.marcos.pago.por ? ` · registrado por ${l.marcos.pago.por.nome}` : ""}` : "Pago"}{l.forma ? ` · ${ROTULO_DA_FORMA[l.forma]}` : ""}{l.contaCorrente ? ` · ${l.contaCorrente.nome}` : ""}.</p>
      {l.comprovanteAtual ? <p><LinkDoAnexo anexo={l.comprovanteAtual} /></p> : null}
      <p className={estilosFicha.muted}>Falta conciliar com a linha do extrato.</p>
    </Destaque>;
    case "gerada": return pode("registrar_nf") ? <Destaque icone={FileText} titulo="Emitir a nota fiscal">
      <p>A cobrança já está no OMIE da {empresa}{l.omie.codigo ? ` (título ${l.omie.codigo})` : ""}. Emita a NFS-e no portal da prefeitura e registre o número; o PDF pode ir junto.</p>
    </Destaque> : null;
    case "nf_emitida": return pode("registrar_boleto") ? <Destaque icone={Barcode} titulo="Gerar o boleto">
      <p>Gere o boleto no OMIE da {empresa} e anexe o PDF aqui: o link do OMIE vale 24 horas, o arquivo guardado não expira.</p>
      {l.nf ? <p className={estilosFicha.muted}>NF {l.nf.numero} · {valorEmReais(l.valor)} · vence em {diaLegivel(l.vencimento)}.</p> : null}
      <FormDoBoleto l={l} ocupado={ocupado} formId={formId} aoAgir={aoAgir} aoAnexar={aoAnexar} />
    </Destaque> : null;
    case "boleto_gerado": return pode("registrar_envio") ? <Destaque icone={Send} titulo="Enviar ao cliente">
      <p>A NF e o boleto vão juntos para o contato de faturamento de <strong>{l.favorecido.nome}</strong>. Registre por onde foram.</p>
      <div className={styles.chips}>
        {atual(l, "nf") ? <LinkDoAnexo anexo={atual(l, "nf")!} /> : null}
        {atual(l, "boleto") ? <LinkDoAnexo anexo={atual(l, "boleto")!} /> : null}
      </div>
      <FormDoEnvio ocupado={ocupado} formId={formId} aoAgir={aoAgir} />
    </Destaque> : null;
    case "enviada": {
      const dias = l.prazo && l.prazo.dias < 0 ? -l.prazo.dias : 0;
      return <Destaque icone={l.emCobranca ? MessageSquare : Clock} titulo={l.emCobranca ? `Vencida há ${dias} ${dias === 1 ? "dia" : "dias"} · em cobrança` : "Aguardando o pagamento"}>
        <p>{l.envio ? `Enviada em ${dataEmManaus(l.envio.em)}${l.envio.por ? ` por ${l.envio.por.nome}` : ""}, por ${l.envio.canal}.` : "Enviada ao cliente."} Quando o cliente pagar, registre o recebimento{l.emCobranca ? "; até lá, registre cada contato de cobrança" : ""}.</p>
        {l.cobrancas.length ? <ul className={styles.cobrancas} aria-label="Cobranças registradas">
          {l.cobrancas.map((c, i) => <li key={`${c.em}-${i}`}><MessageSquare size={14} aria-hidden="true" /><span><strong>{c.canal}{c.por ? ` · ${c.por.nome}` : ""}</strong><small>{dataEmManaus(c.em)}{c.nota ? ` · ${c.nota}` : ""}</small></span></li>)}
        </ul> : null}
        {pode("registrar_cobranca") ? <FormDaCobranca ocupado={ocupado} aoAgir={aoAgir} /> : null}
      </Destaque>;
    }
    case "recebida": return <Destaque icone={ArrowDownLeft} titulo="Recebida" tom="ok">
      <p>{l.marcos.recebido ? `${valorEmReais(l.marcos.recebido.valor)} em ${diaLegivel(l.marcos.recebido.recebidoEm)}${l.contaCorrente ? ` · ${l.contaCorrente.nome}` : ""}${l.marcos.recebido.por ? ` · registrado por ${l.marcos.recebido.por.nome}` : ""}.` : "Recebida."}</p>
      {l.comprovanteAtual ? <p><LinkDoAnexo anexo={l.comprovanteAtual} /></p> : null}
      <p className={estilosFicha.muted}>Falta conciliar com a linha do extrato.</p>
    </Destaque>;
    case "conciliada": return <Destaque icone={CheckCircle2} titulo="Conciliado com o extrato" tom="ok">
      <p>{l.marcos.conciliado ? `Conciliado em ${dataEmManaus(l.marcos.conciliado.em)}${l.marcos.conciliado.por ? ` por ${l.marcos.conciliado.por.nome}` : ""}.` : "Conciliado."}</p>
    </Destaque>;
  }
}

/** Forma, conta e dia, com o comprovante obrigatório: anexa (se veio um novo) e depois paga. */
function FormDoPagamento({ l, opcoes, ocupado, hoje, formId, aoAgir, aoAnexar }: { l: Lancamento; opcoes: OpcoesDoFinanceiro | null; ocupado: boolean; hoje: string; formId: string; aoAgir: Agir; aoAnexar: Anexar }) {
  const [forma, setForma] = useState<FormaDoLancamento | "">(l.forma ?? "");
  const [conta, setConta] = useState(l.contaCorrente?.id ?? "");
  const [pagoEm, setPagoEm] = useState(hoje);
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const { corpo, porCampo } = corpoDoPagamento({ forma, contaCorrenteId: conta, pagoEm, temComprovante: Boolean(l.comprovanteAtual) || arquivo.length > 0 }, hoje);
    const problema = arquivo[0] ? problemaDoAnexo(arquivo[0]) : null;
    if (problema) porCampo.comprovante = problema;
    setErros(porCampo);
    if (!corpo || problema) return;
    if (arquivo[0]) {
      const falha = await aoAnexar("comprovante", arquivo[0]);
      if (falha) { setErros({ comprovante: falha }); return; }
      setArquivo([]);
    }
    await aoAgir(corpo);
  }

  const formas = formasDoLancamento.map((f) => ({ value: f, label: ROTULO_DA_FORMA[f], icon: <CreditCard /> }));
  return <form id={formId} className={styles.formDaEtapa} onSubmit={(e) => void enviar(e)} noValidate>
    {!opcoes ? <Alert tone="warning" title="Não foi possível ler as contas correntes. Recarregue a página para pagar." /> : null}
    <div className={styles.camposDaEtapa}>
      <CampoDeMenu label="Forma de pagamento" required options={formas} value={forma || undefined} icon={<CreditCard />} placeholder="Selecione" error={erros.forma} onChange={(v) => setForma(v as FormaDoLancamento)} />
      <CampoDeMenu label="Conta corrente" required options={contasDoMenu(opcoes, l)} value={conta || undefined} icon={<Landmark />} placeholder="Selecione a conta" disabled={!opcoes} hint="De onde saiu o pagamento." error={erros.contaCorrenteId} onChange={setConta} />
      <DatePicker label="Pago em" required max={hoje} value={pagoEm} onChange={setPagoEm} error={erros.pagoEm} />
    </div>
    <CampoDoArquivo rotulo="Comprovante" obrigatorio anexoAtual={l.comprovanteAtual} arquivo={arquivo} aoMudar={(f) => { setArquivo(f); setErros((e) => ({ ...e, comprovante: "" })); }} erro={erros.comprovante || undefined} disabled={ocupado} />
  </form>;
}

/** O PDF do boleto (obrigatório até o GerarBoleto do OMIE): anexa e registra. */
function FormDoBoleto({ l, ocupado, formId, aoAgir, aoAnexar }: { l: Lancamento; ocupado: boolean; formId: string; aoAgir: Agir; aoAnexar: Anexar }) {
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const boleto = atual(l, "boleto");
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const problema = arquivo[0] ? problemaDoAnexo(arquivo[0]) : boleto ? null : "anexe o PDF do boleto.";
    setErro(problema);
    if (problema) return;
    if (arquivo[0]) {
      const falha = await aoAnexar("boleto", arquivo[0]);
      if (falha) { setErro(falha); return; }
      setArquivo([]);
    }
    await aoAgir({ acao: "registrar_boleto" });
  }
  return <form id={formId} className={styles.formDaEtapa} onSubmit={(e) => void enviar(e)} noValidate>
    <CampoDoArquivo rotulo="Boleto" obrigatorio anexoAtual={boleto} arquivo={arquivo} aoMudar={(f) => { setArquivo(f); setErro(null); }} erro={erro ?? undefined} disabled={ocupado} />
  </form>;
}

function FormDoEnvio({ ocupado, formId, aoAgir }: { ocupado: boolean; formId: string; aoAgir: Agir }) {
  const [canal, setCanal] = useState<string>("E-mail");
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const problema = textoDaAcao(canal, 60, "escolha por onde foi enviada.");
    setErro(problema);
    if (!problema) await aoAgir({ acao: "registrar_envio", canal });
  }
  return <form id={formId} className={styles.formDaEtapa} onSubmit={(e) => void enviar(e)} noValidate>
    <div className={styles.camposDaEtapa}>
      <CampoDeMenu label="Enviada por" required options={canais} value={canal} icon={<Send />} disabled={ocupado} error={erro ?? undefined} onChange={setCanal} />
    </div>
  </form>;
}

/** Cada contato de cobrança vai à linha do tempo; não muda a etapa. */
function FormDaCobranca({ ocupado, aoAgir }: { ocupado: boolean; aoAgir: Agir }) {
  const [canal, setCanal] = useState<string>("WhatsApp");
  const [nota, setNota] = useState("");
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (await aoAgir({ acao: "registrar_cobranca", canal, ...(nota.trim() ? { nota: nota.trim() } : {}) })) setNota("");
  }
  return <form className={styles.formDaEtapa} onSubmit={(e) => void enviar(e)} noValidate aria-label="Registrar cobrança">
    <div className={styles.camposDaEtapa}>
      <CampoDeMenu label="Canal" required options={canais} value={canal} icon={<MessageSquare />} disabled={ocupado} onChange={setCanal} />
      <TextField label="O que ficou combinado" maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: paga até sexta" disabled={ocupado} />
    </div>
    <div className={estilosFicha.botoes}><Button type="submit" variant="secondary" size="sm" icon={<MessageSquare size={14} />} disabled={ocupado}>Registrar cobrança</Button></div>
  </form>;
}

/** Número da NF (obrigatório) e o PDF (opcional), anexado antes de registrar. */
export function RegistrarNf({ l, aoVoltar, aoAgir, aoAnexar }: { l: Lancamento; aoVoltar: () => void; aoAgir: Agir; aoAnexar: Anexar }) {
  const [numero, setNumero] = useState("");
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    const porCampo: Record<string, string> = {};
    const n = textoDaAcao(numero, 60, "informe o número da NF.");
    if (n) porCampo.numero = n;
    const p = arquivo[0] ? problemaDoAnexo(arquivo[0]) : null;
    if (p) porCampo.arquivo = p;
    setErros(porCampo);
    if (Object.keys(porCampo).length) return;
    setEnviando(true);
    const falha = arquivo[0] ? await aoAnexar("nf", arquivo[0]) : null;
    if (falha) { setEnviando(false); setErros({ arquivo: falha }); return; }
    const ok = await aoAgir({ acao: "registrar_nf", numero: numero.trim() });
    setEnviando(false);
    if (ok) aoVoltar();
  }
  return <Dialog title={`Registrar a NF de ${l.codigo}`} size="estreita" icon={<FileText size={20} />} description="A NFS-e emitida no portal da prefeitura. O PDF fica guardado no lançamento." onClose={aoVoltar} cancelText="Voltar"
    footer={<Button type="submit" form="form-registrar-nf" icon={<FileText size={15} />} disabled={enviando}>{enviando ? "Registrando…" : "Registrar NF"}</Button>}>
    <form id="form-registrar-nf" className="ui-dialog-form" onSubmit={(e) => void confirmar(e)} noValidate>
      <TextField label="Número da NF" required maxLength={60} autoFocus value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 2026/000410" error={erros.numero} />
      <CampoDoArquivo rotulo="PDF da NF" obrigatorio={false} anexoAtual={atual(l, "nf")} arquivo={arquivo} aoMudar={(f) => { setArquivo(f); setErros((e) => ({ ...e, arquivo: "" })); }} erro={erros.arquivo || undefined} disabled={enviando} />
    </form>
  </Dialog>;
}

/** Conta, dia e valor recebido (pode diferir do cobrado), com o comprovante opcional. */
export function RegistrarRecebimento({ l, opcoes, hoje, aoVoltar, aoAgir, aoAnexar }: { l: Lancamento; opcoes: OpcoesDoFinanceiro | null; hoje: string; aoVoltar: () => void; aoAgir: Agir; aoAnexar: Anexar }) {
  const [conta, setConta] = useState(l.contaCorrente?.id ?? "");
  const [recebidoEm, setRecebidoEm] = useState(hoje);
  const [valor, setValor] = useState(Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const { corpo, porCampo } = corpoDoRecebimento({ contaCorrenteId: conta, recebidoEm, valor }, hoje);
    const p = arquivo[0] ? problemaDoAnexo(arquivo[0]) : null;
    if (p) porCampo.comprovante = p;
    setErros(porCampo);
    if (!corpo || p) return;
    setEnviando(true);
    const falha = arquivo[0] ? await aoAnexar("comprovante", arquivo[0]) : null;
    if (falha) { setEnviando(false); setErros({ comprovante: falha }); return; }
    const ok = await aoAgir(corpo);
    setEnviando(false);
    if (ok) aoVoltar();
  }
  return <Dialog title={`Registrar o recebimento de ${l.codigo}`} size="estreita" icon={<ArrowDownLeft size={20} />} description={`Cobrado: ${valorEmReais(l.valor)}. Se o cliente pagou outro valor (juros, desconto), digite o que entrou.`} onClose={aoVoltar} cancelText="Voltar"
    footer={<Button type="submit" form="form-registrar-recebimento" icon={<CheckCircle2 size={15} />} disabled={enviando}>{enviando ? "Registrando…" : "Registrar recebimento"}</Button>}>
    <form id="form-registrar-recebimento" className="ui-dialog-form" onSubmit={(e) => void confirmar(e)} noValidate>
      {!opcoes ? <Alert tone="warning" title="Não foi possível ler as contas correntes. Recarregue a página." /> : null}
      <CampoDeMenu label="Conta corrente" required options={contasDoMenu(opcoes, l)} value={conta || undefined} icon={<Landmark />} placeholder="Selecione a conta" disabled={!opcoes} hint="Onde o dinheiro entrou." error={erros.contaCorrenteId} onChange={setConta} />
      <DatePicker label="Recebido em" required max={hoje} value={recebidoEm} onChange={setRecebidoEm} error={erros.recebidoEm} />
      <TextField label="Valor recebido" required inputMode="decimal" prefix="R$" value={valor} onChange={(e) => setValor(valorEmDigitacao(e.target.value))} error={erros.valor} />
      <CampoDoArquivo rotulo="Comprovante" obrigatorio={false} anexoAtual={l.comprovanteAtual} arquivo={arquivo} aoMudar={(f) => { setArquivo(f); setErros((e) => ({ ...e, comprovante: "" })); }} erro={erros.comprovante || undefined} disabled={enviando} />
    </form>
  </Dialog>;
}

/**
 * Antes de liquidar, com o motivo, que fica na linha do tempo. Na cobrança com o
 * boleto já gerado, o boleto antigo leva o valor antigo: a correção pede antes o
 * boleto novo (decisão do Coordenador; a API recusa sem ele).
 */
export function CorrigirValor({ l, aoVoltar, aoAgir, aoAnexar }: { l: Lancamento; aoVoltar: () => void; aoAgir: Agir; aoAnexar: Anexar }) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const pedeBoleto = boletoNovoNaCorrecao(l);
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    const { corpo, porCampo } = corpoDaCorrecao({ valor, motivo }, l.valor);
    if (pedeBoleto) {
      const problema = arquivo[0] ? problemaDoAnexo(arquivo[0]) : "anexe o boleto com o valor novo.";
      if (problema) porCampo.boleto = problema;
    }
    setErros(porCampo);
    if (!corpo || porCampo.boleto) return;
    setEnviando(true);
    const falha = pedeBoleto && arquivo[0] ? await aoAnexar("boleto", arquivo[0]) : null;
    if (falha) { setEnviando(false); setErros({ boleto: falha }); return; }
    if (pedeBoleto) setArquivo([]);
    const ok = await aoAgir(corpo);
    setEnviando(false);
    if (ok) aoVoltar();
  }
  return <Dialog title={`Corrigir o valor de ${l.codigo}`} size="estreita" icon={<Pencil size={20} />} description={`Valor atual: ${valorEmReais(l.valor)}. A correção e o motivo ficam na linha do tempo.`} onClose={aoVoltar} cancelText="Voltar"
    footer={<Button type="submit" form="form-corrigir-valor" icon={<Pencil size={15} />} disabled={enviando}>{enviando ? "Corrigindo…" : "Corrigir valor"}</Button>}>
    <form id="form-corrigir-valor" className="ui-dialog-form" onSubmit={(e) => void confirmar(e)} noValidate>
      <TextField label="Novo valor" required inputMode="decimal" prefix="R$" autoFocus value={valor} onChange={(e) => setValor(valorEmDigitacao(e.target.value))} placeholder="0,00" error={erros.valor} />
      <TextareaField label="Motivo" required maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: juros do atraso" error={erros.motivo} />
      {pedeBoleto ? <>
        <Alert tone="info" title="O boleto já foi gerado com o valor antigo">Gere no OMIE o boleto com o valor novo e anexe aqui. O anterior fica nas versões anteriores.</Alert>
        <CampoDoArquivo rotulo="Boleto com o valor novo" obrigatorio anexoAtual={null} arquivo={arquivo} aoMudar={(f) => { setArquivo(f); setErros((e) => ({ ...e, boleto: "" })); }} erro={erros.boleto || undefined} disabled={enviando} />
      </> : null}
    </form>
  </Dialog>;
}
