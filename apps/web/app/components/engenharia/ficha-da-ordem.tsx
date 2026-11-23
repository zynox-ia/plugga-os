"use client";

import { CODIGO_CHECKIN_ANTECIPADO, type AcaoDaOrdemDeServico, type ListarPlataformasResposta, type OpcoesDaEngenhariaResposta, type OrdemDeServico, type PlataformaDeInversor } from "@plugga/shared";
import { Ban, CalendarCheck, Camera, ClipboardPen, History, LayoutGrid, MapPin, Package, Pencil, ShoppingCart, Signature, Sun, Undo2, Wrench, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { hojeEmManaus } from "../../lib/compras";
import { agoraEmManaus, problemasDoAdiamento, problemasDoAgendamento, quandoNaFicha, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import fichaCompras from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import { Avatar } from "../pipelines/icones";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Alert, Button, DatePicker, Dialog, TextareaField } from "../ui";
import { dataInvalidaEm } from "../ui/date-picker";
import { EquipamentoDaOrdem, EvidenciasDaOrdem, LinhaDoTempoDaOrdem, MaterialDaOrdem } from "./abas-da-ordem";
import { agirNaOrdem, enviarArquivoDaOrdem, problemaDaFoto, relerOrdem, type RespostaDaOrdem } from "./envios";
import styles from "./ficha-da-ordem.module.css";
import { OrdemForm } from "./ordem-form";
import { UsinaForm } from "./usina-form";
import { IconeDoTipo } from "./partes";
import { PedirMaterial } from "./pedir-material";
import type { TermoNaTelaRef } from "./termo-da-ordem";
import { VisaoGeralDaOrdem, type Agendamento, type Laudo } from "./visao-geral-da-ordem";

type Aba = "geral" | "equipamento" | "evidencias" | "material" | "tempo";
type Janela = null | "adiar" | "cancelar" | "editar" | "material" | "usina" | { antecipado: string | null };

const AVISO: Partial<Record<AcaoDaOrdemDeServico["acao"], string>> = {
  agendar: "O.S. agendada.",
  check_in: "Check-in feito: a O.S. está em campo.",
  registrar_laudo: "Laudo registrado: falta o termo do cliente.",
  adiar: "O.S. adiada.",
  cancelar: "O.S. cancelada.",
};

const agendamentoDe = (o: OrdemDeServico): Agendamento => ({
  tecnicoId: o.tecnico?.id ?? "",
  apoioId: o.apoio?.id ?? "",
  data: o.situacao === "adiada" ? (o.adiamento?.novaData ?? "") : "",
  horario: "08:00",
});

/**
 * Ficha da O.S. (PLU-345): cabeçalho e abas da ficha do lead, guiada pelas
 * ações que a API permite agora. Cada passagem exige o seu dado: técnico e
 * data, check-in, laudo com fotos e o termo.
 */
export function FichaDaOrdem({ ordem: inicial, opcoes, podeAbrirCompras, podeCadastrarUsina = false, aoFechar, aoAtualizar }: {
  ordem: OrdemDeServico;
  opcoes: OpcoesDaEngenhariaResposta | null;
  podeAbrirCompras: boolean;
  /** Tela de Usinas (PLU-347): sem ela, o "Cadastrar usina" não aparece (a API daria 403). */
  podeCadastrarUsina?: boolean;
  aoFechar: () => void;
  aoAtualizar: () => void;
}) {
  const id = useId();
  const [ordem, setOrdem] = useState(inicial);
  const [aba, setAba] = useState<Aba>("geral");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const [agendamento, setAgendamento] = useState<Agendamento>(() => agendamentoDe(inicial));
  const [errosDoAgendamento, setErrosDoAgendamento] = useState<Partial<Record<keyof Agendamento, string>>>({});
  const [laudo, setLaudo] = useState<Laudo>({ encontrado: "", feito: "", recomendacao: "" });
  const [errosDoLaudo, setErrosDoLaudo] = useState<Partial<Record<keyof Laudo, string>>>({});
  const [remarcando, setRemarcando] = useState(false);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const termo = useRef<TermoNaTelaRef>(null);
  const [plataformas, setPlataformas] = useState<PlataformaDeInversor[] | null>(null);
  const hoje = hojeEmManaus();

  // O servidor recarrega a ficha depois de cada ação (router.refresh); a versão mais nova vence.
  useEffect(() => { setOrdem((atual) => (inicial.updatedAt > atual.updatedAt ? inicial : atual)); }, [inicial]);

  function atualizada(nova: OrdemDeServico, mensagem: string | null) {
    const mudouDeEtapa = nova.situacao !== ordem.situacao;
    setOrdem(nova); setErro(null); setAviso(mensagem);
    if (mudouDeEtapa) { setAgendamento(agendamentoDe(nova)); setRemarcando(false); setErrosDoAgendamento({}); setErrosDoLaudo({}); }
    aoAtualizar();
  }

  /** Depois de um conflito, relê a O.S.; diz se ela mudou de etapa enquanto a ficha estava aberta. */
  async function aposErro(r: Extract<RespostaDaOrdem, { ok: false }>) {
    if (r.erro.codigo === "CONFLITO_ESTADO") {
      const nova = await relerOrdem(ordem.id);
      if (nova.ok && nova.dados.situacao !== ordem.situacao) {
        setOrdem(nova.dados);
        setErro(`${r.erro.mensagem} A O.S. mudou enquanto a ficha estava aberta: ela foi atualizada.`);
        return;
      }
    }
    const porCampo = Object.values(r.erro.porCampo);
    setErro(porCampo.length ? `${r.erro.mensagem} ${porCampo.join(" ")}` : r.erro.mensagem);
  }

  async function agir(acao: AcaoDaOrdemDeServico): Promise<boolean> {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await agirNaOrdem(ordem.id, acao);
    setOcupado(false);
    if (r.ok) { atualizada(r.dados, AVISO[acao.acao] ?? null); return true; }
    // Check-in antes do dia agendado: pede a confirmação, que remarca para agora (regra da API).
    if (acao.acao === "check_in" && r.erro.motivo === CODIGO_CHECKIN_ANTECIPADO) { setJanela({ antecipado: r.erro.agendadaPara ?? ordem.agendadaPara }); return false; }
    await aposErro(r);
    return false;
  }

  function agendar() {
    if (dataInvalidaEm(document.getElementById(`${id}-painel`))) return;
    const problemas = problemasDoAgendamento(agendamento, hoje, agoraEmManaus());
    setErrosDoAgendamento(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    void agir({ acao: "agendar", tecnicoId: agendamento.tecnicoId, apoioId: agendamento.apoioId || null, data: agendamento.data, horario: agendamento.horario });
  }

  function registrarLaudo() {
    const problemas = { encontrado: laudo.encontrado.trim() ? undefined : "descreva o que foi encontrado.", feito: laudo.feito.trim() ? undefined : "descreva o que foi feito." };
    setErrosDoLaudo(problemas);
    if (problemas.encontrado || problemas.feito) return;
    if (ordem.fotos.length === 0) { setErro("Envie ao menos uma foto do campo antes de registrar o laudo."); setAba("evidencias"); return; }
    void agir({ acao: "registrar_laudo", encontrado: laudo.encontrado.trim(), feito: laudo.feito.trim(), recomendacao: laudo.recomendacao.trim() || null });
  }

  async function enviarFotos(arquivos: File[]) {
    const problemas = arquivos.map(problemaDaFoto).filter(Boolean);
    if (problemas.length) { setErro(problemas.join(" ")); return; }
    setOcupado(true); setErro(null); setAviso(null);
    let ultima: OrdemDeServico | null = null;
    for (const arquivo of arquivos) {
      const form = new FormData(); form.set("arquivo", arquivo);
      const r = await enviarArquivoDaOrdem(ordem.id, "/fotos", form);
      if (!r.ok) { setOcupado(false); if (ultima) atualizada(ultima, null); await aposErro(r); return; }
      ultima = r.dados;
    }
    setOcupado(false);
    if (ultima) atualizada(ultima, arquivos.length === 1 ? "Foto enviada." : `${arquivos.length} fotos enviadas.`);
  }

  /** As plataformas para a Nova usina, lidas só quando a pessoa pede. */
  async function abrirCadastroDeUsina() {
    if (!plataformas) {
      const r = await enviar<ListarPlataformasResposta>("/api/engenharia/plataformas", "GET");
      if (!r.ok) { setErro(r.erro.mensagem); return; }
      setPlataformas(r.dados.itens);
    }
    setJanela("usina");
  }

  /** O termo assinado (na tela ou o PDF) conclui a O.S. */
  function concluida(r: RespostaDaOrdem | null, comoPdf: boolean) {
    if (!r) return;
    if (r.ok) atualizada(r.dados, comoPdf ? "O.S. concluída com o termo assinado em PDF." : "O.S. concluída: o termo assinado ficou guardado em PDF.");
    else void aposErro(r);
  }
  async function concluirComOTermo() {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await termo.current?.concluir() ?? null;
    setOcupado(false);
    concluida(r, false);
  }

  const pode = (a: OrdemDeServico["acoesPermitidas"][number]) => ordem.acoesPermitidas.includes(a);
  const abas: { id: Aba; titulo: string; curto: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", curto: "Geral", icone: LayoutGrid },
    { id: "equipamento", titulo: "Equipamento", curto: "Equip.", icone: Wrench },
    { id: "evidencias", titulo: "Evidências", curto: "Fotos", conta: ordem.fotos.length, icone: Camera },
    { id: "material", titulo: "Material", curto: "Material", conta: ordem.pedidosDeMaterial.length, icone: Package },
    { id: "tempo", titulo: "Linha do tempo", curto: "Tempo", icone: History },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }
  const verEvidencias = () => { setAba("evidencias"); botoes.current[2]?.focus(); };

  const principal = (ordem.situacao === "aberta" || ordem.situacao === "adiada") && pode("agendar")
    ? <Button icon={<CalendarCheck size={15} />} disabled={ocupado} onClick={agendar}>Agendar</Button>
    : ordem.situacao === "agendada" && remarcando
      ? <><Button variant="secondary" disabled={ocupado} onClick={() => { setRemarcando(false); setErrosDoAgendamento({}); }}>Voltar</Button><Button icon={<CalendarCheck size={15} />} disabled={ocupado} onClick={agendar}>Salvar nova data</Button></>
      : ordem.situacao === "agendada" && pode("check_in")
        ? <Button icon={<MapPin size={15} />} disabled={ocupado} onClick={() => void agir({ acao: "check_in" })}>Fazer check-in</Button>
        : ordem.situacao === "em_campo" && pode("registrar_laudo")
          ? <Button icon={<ClipboardPen size={15} />} disabled={ocupado} onClick={registrarLaudo}>Registrar laudo</Button>
          : ordem.situacao === "laudo" && pode("colher_termo")
            ? <Button icon={<Signature size={15} />} disabled={ocupado} onClick={() => { if (aba !== "geral") setAba("geral"); else void concluirComOTermo(); }}>Concluir com o termo</Button> : null;
  const encerrada = ordem.situacao === "concluida" || ordem.situacao === "cancelada";
  // A usina nasce do comissionamento concluído (PLU-347): cliente, UC e empresa vêm da O.S.
  const cadastraUsina = podeCadastrarUsina && ordem.situacao === "concluida" && ordem.tipo === "comissionamento" && !ordem.usina;
  const rodape = cadastraUsina ? <footer className={`${fichaCompras.rodape} ${styles.rodape}`}>
    <span className={fichaCompras.espaco} />
    <Button icon={<Sun size={15} />} onClick={() => void abrirCadastroDeUsina()}>Cadastrar usina</Button>
  </footer> : !encerrada && (pode("cancelar") || pode("adiar") || principal) ? <footer className={`${fichaCompras.rodape} ${styles.rodape}`}>
    {pode("cancelar") ? <Button variant="secondary" className={fichaCompras.perigo} icon={<Ban size={15} />} disabled={ocupado} onClick={() => setJanela("cancelar")}>Cancelar O.S.</Button> : null}
    {pode("adiar") ? <Button variant="secondary" icon={<Undo2 size={15} />} disabled={ocupado} onClick={() => setJanela("adiar")}>Adiar</Button> : null}
    <span className={fichaCompras.espaco} />
    {principal}
  </footer> : null;

  const titulo = `${ROTULO_DO_TIPO[ordem.tipo]} · ${ordem.cliente.nome}`;
  // Os diálogos (adiar, cancelar, check-in, termo…) ficam fora da ficha: a ficha do lead fixa a altura de todo
  // .modal-conteudo dentro dela. O <dialog> nativo empilha na camada superior do mesmo jeito.
  return <><Modal rotulo={`${ordem.codigo}: ${titulo}`} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}>
          <div className={detalhes.leadCardLinhaSuperior}>
            <div className={detalhes.iconeLead} aria-hidden="true"><IconeDoTipo tipo={ordem.tipo} tamanho={20} /></div>
            <div className={detalhes.identidadeLead}>
              <h2 className={detalhes.leadCardTitulo}>{titulo}</h2>
              <div className={detalhes.metadadosCabecalho}>
                <span>{ordem.codigo}</span><span aria-hidden="true">·</span>
                <span className={fichaCompras.empresaCabecalho}><EmpresaComPonto empresa={ordem.empresa} /></span>
                {ordem.local ? <><span aria-hidden="true">·</span><span><MapPin size={13} aria-hidden="true" />{ordem.local}</span></> : null}
                <span aria-hidden="true">·</span>
                {ordem.tecnico
                  ? <span className={detalhes.responsavelInline}><span aria-hidden="true"><Avatar id={ordem.tecnico.id} nome={ordem.tecnico.nome} tamanho="pequeno" /></span>{ordem.tecnico.nome}</span>
                  : <span>Sem técnico</span>}
              </div>
            </div>
          </div>
        </div>
        <div className={detalhes.controlesCabecalho}>
          {pode("editar") ? <Button variant="secondary" size="sm" icon={<Pencil size={14} />} disabled={ocupado} onClick={() => setJanela("editar")}>Editar</Button> : null}
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} disabled={ocupado} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} ${fichaCompras.abas} ${styles.abas} plg-parte`} role="tablist" aria-label="Seções da O.S." aria-orientation="horizontal" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`}
              aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span><span className={fichaCompras.abaLonga}>{a.titulo}</span><span className={fichaCompras.abaCurta} aria-hidden="true">{a.curto}</span>{a.conta !== undefined ? <span className={fichaCompras.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${fichaCompras.painel} plg-parte`} aria-busy={ocupado}>
          {erro || aviso ? <div className={fichaCompras.avisos}>
            {erro ? <p role="alert" className="aviso aviso--erro">{erro}</p> : null}
            {aviso ? <p role="status" className="aviso aviso--sucesso">{aviso}</p> : null}
          </div> : null}
          {aba === "geral" ? <VisaoGeralDaOrdem ordem={ordem} opcoes={opcoes} hoje={hoje} ocupado={ocupado} aoVerEvidencias={verEvidencias} termo={termo}
            aoPdfAssinado={(r) => { setErro(null); setAviso(null); concluida(r, true); }}
            estado={{ agendamento, errosDoAgendamento, aoAgendamento: setAgendamento, laudo, errosDoLaudo, aoLaudo: setLaudo, remarcando, aoRemarcar: setRemarcando }} /> : null}
          {aba === "equipamento" ? <EquipamentoDaOrdem ordem={ordem} /> : null}
          {aba === "evidencias" ? <EvidenciasDaOrdem ordem={ordem} ocupado={ocupado} aoEnviar={(arquivos) => void enviarFotos(arquivos)} /> : null}
          {aba === "material" ? <MaterialDaOrdem ordem={ordem} podeAbrirCompras={podeAbrirCompras} acaoDePedir={pode("pedir_material") ? <Button size="sm" icon={<ShoppingCart size={14} />} disabled={ocupado} onClick={() => setJanela("material")}>Pedir material</Button> : null} /> : null}
          {aba === "tempo" ? <LinhaDoTempoDaOrdem ordem={ordem} hoje={hoje} /> : null}
        </section>
        {/* Fora da rolagem, como no protótipo: as ações da etapa ficam à vista em qualquer aba. */}
        {rodape}
      </div>
    </div>
  </Modal>
    {janela === "adiar" ? <AdiarOrdem hoje={hoje} aoCancelar={() => setJanela(null)}
      aoConfirmar={async (motivo, novaData) => { const ok = await agir({ acao: "adiar", motivo, novaData }); if (ok) setJanela(null); return ok; }} /> : null}
    {janela === "cancelar" ? <CancelarOrdem aoCancelar={() => setJanela(null)}
      aoConfirmar={async (motivo) => { const ok = await agir({ acao: "cancelar", motivo }); if (ok) setJanela(null); return ok; }} /> : null}
    {janela && typeof janela === "object" ? <CheckinAntecipado agendadaPara={janela.antecipado} hoje={hoje} ocupado={ocupado} aoCancelar={() => setJanela(null)}
      aoConfirmar={async () => { const ok = await agir({ acao: "check_in", confirmarAntecipado: true }); setJanela(null); return ok; }} /> : null}
    {janela === "usina" && plataformas ? <UsinaForm plataformas={plataformas} hoje={hoje} aoCancelar={() => setJanela(null)}
      comissionamento={{ ordemId: ordem.id, empresa: ordem.empresa, cliente: { id: ordem.cliente.id, nome: ordem.cliente.nome, ucs: ordem.uc ? [ordem.uc] : [] }, ucId: ordem.uc?.id ?? null }}
      aoSalvar={(u) => { setJanela(null); setAviso(`${u.nome} cadastrada a partir do comissionamento.`); aoAtualizar(); }} /> : null}
    {janela === "editar" ? <OrdemForm ordem={ordem} hoje={hoje} aoCancelar={() => setJanela(null)} aoSalvar={(o) => { setJanela(null); atualizada(o, "O.S. atualizada."); }} /> : null}
    {janela === "material" ? <PedirMaterial ordem={ordem} hoje={hoje} aoCancelar={() => setJanela(null)}
      aoPedir={(o) => { setJanela(null); const novo = o.pedidosDeMaterial.find((p) => !ordem.pedidosDeMaterial.some((x) => x.id === p.id)); atualizada(o, novo ? `Material pedido em Compras: PC-${String(novo.numero).padStart(4, "0")}.` : "Material pedido em Compras."); setAba("material"); }} /> : null}
  </>;
}

/** Check-in antes do dia agendado: confirma, remarca para agora e registra na linha do tempo. */
function CheckinAntecipado({ agendadaPara, hoje, ocupado, aoCancelar, aoConfirmar }: { agendadaPara: string | null; hoje: string; ocupado: boolean; aoCancelar: () => void; aoConfirmar: () => Promise<boolean> }) {
  return <Dialog title="Check-in antes do dia agendado" size="estreita" icon={<MapPin size={20} />} onClose={aoCancelar} cancelText="Voltar"
    description={`Agendada para ${quandoNaFicha(agendadaPara, hoje)}.`}
    footer={<Button icon={<MapPin size={15} />} disabled={ocupado} onClick={() => void aoConfirmar()}>{ocupado ? "Enviando…" : "Fazer check-in agora"}</Button>}>
    <p className={styles.textoDoDialogo}>Fazer o check-in agora remarca a O.S. para agora e fica registrado na linha do tempo.</p>
  </Dialog>;
}

/** Adiar exige motivo e nova data; volta por "agendar". */
function AdiarOrdem({ hoje, aoCancelar, aoConfirmar }: { hoje: string; aoCancelar: () => void; aoConfirmar: (motivo: string, novaData: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");
  const [erros, setErros] = useState<Partial<Record<"motivo" | "novaData", string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    const problemas = problemasDoAdiamento({ motivo, novaData }, hoje);
    setErros(problemas);
    if (problemas.motivo || problemas.novaData) return;
    setEnviando(true); setFalhou(false);
    const ok = await aoConfirmar(motivo.trim(), novaData);
    setEnviando(false);
    if (!ok) setFalhou(true);
  }
  const amanha = new Date(`${hoje}T12:00:00Z`); amanha.setUTCDate(amanha.getUTCDate() + 1);
  return <Dialog title="Adiar O.S." size="estreita" icon={<Undo2 size={20} />} onClose={aoCancelar} cancelText="Voltar"
    description="A O.S. vai para Adiadas e sai da agenda do técnico. Para voltar, reagende."
    footer={<Button type="submit" form="form-adiar" icon={<Undo2 size={15} />} disabled={enviando}>{enviando ? "Enviando…" : "Adiar"}</Button>}>
    <form id="form-adiar" className="ui-dialog-form" onSubmit={confirmar} noValidate>
      {falhou ? <Alert tone="danger" title="Erro: não foi possível adiar. Veja o aviso na ficha." /> : null}
      <TextareaField label="Motivo" required maxLength={1000} autoFocus value={motivo} onChange={(e) => { setMotivo(e.target.value); setErros((x) => ({ ...x, motivo: undefined })); }} error={erros.motivo} placeholder="Ex.: chuva forte, cliente não estava no local" />
      <DatePicker label="Nova data" required min={amanha.toISOString().slice(0, 10)} value={novaData} onChange={(v) => { setNovaData(v); setErros((x) => ({ ...x, novaData: undefined })); }} error={erros.novaData} />
    </form>
  </Dialog>;
}

/** Cancelar exige o motivo, que fica na ficha e na linha do tempo, com quem e quando. */
function CancelarOrdem({ aoCancelar, aoConfirmar }: { aoCancelar: () => void; aoConfirmar: (motivo: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (!motivo.trim()) { setErro("informe o motivo do cancelamento."); return; }
    setEnviando(true); setErro(null);
    const ok = await aoConfirmar(motivo.trim());
    setEnviando(false);
    if (!ok) setErro("não foi possível cancelar. Veja o aviso na ficha.");
  }
  return <Dialog title="Cancelar O.S." size="estreita" variant="danger" icon={<Ban size={20} />} onClose={aoCancelar} cancelText="Voltar"
    description="A O.S. sai do quadro e guarda a etapa em que parou. Não dá para desfazer."
    footer={<Button type="submit" form="form-cancelar-os" variant="danger" disabled={enviando}>{enviando ? "Enviando…" : "Cancelar O.S."}</Button>}>
    <form id="form-cancelar-os" className="ui-dialog-form" onSubmit={confirmar} noValidate>
      {erro && motivo.trim() ? <Alert tone="danger" title={`Erro: ${erro}`} /> : null}
      <TextareaField label="Motivo" required maxLength={1000} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} error={erro && !motivo.trim() ? erro : undefined} placeholder="Ex.: cliente resolveu com outra empresa" />
    </form>
  </Dialog>;
}

