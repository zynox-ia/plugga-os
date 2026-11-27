"use client";

import type { CompanyKey } from "@plugga/shared";
import { ArrowDownLeft, ArrowUpRight, Building2, FileCode2, FileText, Info, Link2, Plus, Truck, UploadIcon, UserRound, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";

import { tamanhoDoArquivo, valorEmReais } from "../../lib/compras";
import {
  avisoDoValor,
  formatoPeloConteudo,
  lancamentosParaVincular,
  ORDEM_DOS_CAMPOS,
  ROTULO_DA_EMPRESA_NA_NOTA,
  validarNota,
  type CamposDaNota,
  type CampoDaNota,
  type ContraparteDaNota,
  type LancamentoParaNota,
  type NotaFiscal,
  type TipoDaNota,
} from "../../lib/notas-fiscais";
import { dadosDaNfe, preencherComANfe } from "../../lib/notas-fiscais-xml";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, CurrencyField, DatePicker, Dialog, Heading, TextField } from "../ui";
import styles from "./notas-fiscais.module.css";

const SEM_VINCULO = "__sem";
type Tocado = CampoDaNota | "tipo";

/** No navegador, o DOMParser diz se o XML é bem formado (o `parsererror` aparece no documento). */
const xmlBemFormado = (texto: string) => new DOMParser().parseFromString(texto, "application/xml").getElementsByTagName("parsererror").length === 0;

/**
 * "Adicionar nota fiscal" no PROTÓTIPO: o registro manual de uma nota já emitida.
 * O arquivo vem primeiro: soltar o XML de uma NF-e preenche os campos vazios
 * (lib/notas-fiscais-xml.ts), no navegador; o PDF só é anexado. O tipo vem do
 * lado escolhido na tela; a empresa, do filtro. Salvar acrescenta a nota à lista
 * em memória (nada vai à API). O arquivo é conferido pelo conteúdo.
 */
export function AdicionarNotaFiscal({ hoje, tipoInicial, empresaInicial, notas, contrapartes, lancamentos, aoCancelar, aoSalvar }: {
  hoje: string;
  tipoInicial: TipoDaNota;
  empresaInicial: CompanyKey | "";
  notas: readonly NotaFiscal[];
  contrapartes: readonly ContraparteDaNota[];
  lancamentos: readonly LancamentoParaNota[];
  aoCancelar: () => void;
  aoSalvar: (nota: NotaFiscal) => void;
}) {
  const [campos, setCampos] = useState<CamposDaNota>({ tipo: tipoInicial, empresa: empresaInicial, numero: "", emitidaEm: hoje, valor: "", contraparteId: "", lancamento: "", arquivo: null });
  const [erros, setErros] = useState<Partial<Record<CampoDaNota, string>>>({});
  const [tentou, setTentou] = useState(false);
  const [lidoDoXml, setLidoDoXml] = useState(false);
  // O que a pessoa mexeu: o XML não sobrescreve.
  const tocados = useRef(new Set<Tocado>());
  const camposAtuais = useRef(campos);
  camposAtuais.current = campos;
  const formRef = useRef<HTMLFormElement>(null);
  const focar = useRef(false);
  const mudar = (parcial: Partial<CamposDaNota>) => setCampos((atuais) => ({ ...atuais, ...parcial }));
  const digitar = (campo: Tocado, parcial: Partial<CamposDaNota>) => { tocados.current.add(campo); mudar(parcial); };

  const contexto = { hoje, notas, contrapartes, lancamentos, registradaPor: "Você", novoId: `nova-${notas.length + 1}-${Date.now()}` };
  // Depois da primeira tentativa, os erros acompanham a digitação.
  const { erros: errosAgora } = validarNota(campos, contexto);
  const chaveDosErros = JSON.stringify(errosAgora);
  useEffect(() => { if (tentou) setErros(JSON.parse(chaveDosErros) as typeof errosAgora); }, [chaveDosErros, tentou]);
  useEffect(() => {
    if (!focar.current) return;
    focar.current = false;
    const primeiro = ORDEM_DOS_CAMPOS.find((c) => erros[c]);
    const alvo = primeiro ? formRef.current?.querySelector<HTMLElement>(`[data-campo="${primeiro}"] :is(input:not([hidden]), button, [tabindex])`) : null;
    alvo?.focus(); alvo?.scrollIntoView({ block: "center" });
  }, [erros]);

  const entrada = campos.tipo === "entrada";
  const papel = entrada ? "cliente" : "fornecedor";
  const opcoesDeContraparte = contrapartes.filter((c) => c.papel === papel).map((c) => ({ value: c.id, label: c.nome, icon: entrada ? <UserRound /> : <Truck /> }));
  const paraVincular = lancamentosParaVincular(lancamentos, notas, campos);
  const opcoesDeLancamento = [
    { value: SEM_VINCULO, label: "Sem vínculo", icon: <Link2 /> },
    ...paraVincular.map(({ lancamento: l, jaTemNota }) => ({
      value: l.codigo, label: `${l.codigo} · ${l.descricao}`, icon: <Link2 />, aside: valorEmReais(l.valor) ?? undefined,
      description: jaTemNota ? `Já tem a nota nº ${jaTemNota}` : `${contrapartes.find((c) => c.id === l.contraparteId)?.nome ?? ""} · ${l.situacao}`,
      ...(jaTemNota ? { disabled: true } : {}),
    })),
  ];
  const escolhido = campos.lancamento ? lancamentos.find((l) => l.codigo === campos.lancamento) ?? null : null;
  const empresas = (["plugga", "waze"] as const).map((v) => ({ value: v, label: ROTULO_DA_EMPRESA_NA_NOTA[v], icon: <PontoDaEmpresa empresa={v} /> }));

  function trocarTipo(tipo: TipoDaNota) {
    if (tipo !== campos.tipo) digitar("tipo", { tipo, contraparteId: "", lancamento: "" });
  }
  function escolherLancamento(codigo: string) {
    tocados.current.add("lancamento");
    if (codigo === SEM_VINCULO) { mudar({ lancamento: "" }); return; }
    const l = lancamentos.find((x) => x.codigo === codigo);
    // Escolher o lançamento completa o cliente (ou fornecedor) e o valor, se ainda vazios.
    mudar({ lancamento: codigo, ...(l && !campos.contraparteId ? { contraparteId: l.contraparteId } : {}), ...(l && !campos.valor ? { valor: l.valor } : {}) });
  }
  /** Anexa o arquivo; sendo XML de NF-e, preenche o que ainda está vazio. PDF ou XML que não é NF-e só anexa. */
  async function anexar(arquivo: CamposDaNota["arquivo"], conteudo: File | null) {
    setLidoDoXml(false);
    if (!arquivo || !conteudo || arquivo.formato !== "xml") { mudar({ arquivo }); return; }
    const texto = await conteudo.text();
    const { campos: preenchidos, preenchidos: quais } = preencherComANfe({ ...camposAtuais.current, arquivo }, dadosDaNfe(texto, xmlBemFormado(texto)), { contrapartes, tocados: tocados.current });
    setCampos(preenchidos);
    setLidoDoXml(quais.length > 0);
  }

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    const { erros: encontrados, nota } = validarNota(campos, contexto);
    setTentou(true);
    if (!nota) { focar.current = true; setErros(encontrados); return; }
    aoSalvar(nota);
  }

  const quantosErros = Object.keys(erros).length;
  return <Dialog title="Adicionar nota fiscal" icon={<FileText size={20} />} onClose={aoCancelar}
    description="Registro manual de uma nota já emitida, com o PDF ou o XML. Emitir a nota pelo Plugga OS vem depois, com a integração."
    footer={<Button type="submit" form="form-nota-fiscal" icon={<Plus size={16} />}>Adicionar nota</Button>}>
    <form ref={formRef} id="form-nota-fiscal" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {tentou && quantosErros ? <Alert tone="danger" title={quantosErros === 1 ? "Confira o campo destacado." : `Confira os ${quantosErros} campos destacados.`} /> : null}

      <section className="ui-dialog-section">
        <div data-campo="arquivo"><ArquivoDaNota valor={campos.arquivo} erro={erros.arquivo} aoMudar={(arquivo, conteudo) => void anexar(arquivo, conteudo)} /></div>
        {lidoDoXml ? <p className={styles.lidoDoXml} role="status"><Info size={14} aria-hidden="true" />Dados lidos do XML; confira antes de salvar.</p> : null}

        <fieldset className={styles.tipo}>
          <legend className="sr-only">Tipo da nota</legend>
          {(["entrada", "saida"] as const).map((tipo) => {
            const Icone = tipo === "entrada" ? ArrowDownLeft : ArrowUpRight;
            return <label key={tipo} className={`${styles.tipoOpcao} ${tipo === "entrada" ? styles.tipoEntrada : styles.tipoSaida}`}>
              <input className="sr-only" type="radio" name="tipo-da-nota" value={tipo} checked={campos.tipo === tipo} onChange={() => trocarTipo(tipo)} />
              <span className={styles.tipoIcone} aria-hidden="true"><Icone size={16} /></span>
              <span className={styles.tipoTexto}><strong>{tipo === "entrada" ? "Entrada" : "Saída"}</strong><small>{tipo === "entrada" ? "Emitida pela empresa para um cliente" : "Recebida de um fornecedor"}</small></span>
            </label>;
          })}
        </fieldset>
        <div data-campo="empresa">
          <CampoDeMenu label="Empresa" required options={empresas} value={campos.empresa || undefined} icon={<Building2 />} placeholder="Selecione a empresa" error={erros.empresa}
            onChange={(v) => { if (v !== campos.empresa) digitar("empresa", { empresa: v as CompanyKey, lancamento: "" }); }} />
        </div>
        <div className="ui-dialog-grid">
          <div data-campo="numero"><TextField label="Número" required inputMode="numeric" maxLength={14} placeholder="Ex.: 1287" value={campos.numero}
            onChange={(e) => digitar("numero", { numero: e.target.value })} error={erros.numero} hint={erros.numero ? undefined : "Só os algarismos; zeros à esquerda não contam."} /></div>
          <div data-campo="emitidaEm"><DatePicker label="Data de emissão" required max={hoje} value={campos.emitidaEm} onChange={(v) => digitar("emitidaEm", { emitidaEm: v })} error={erros.emitidaEm} /></div>
          <div data-campo="valor"><CurrencyField label="Valor" required value={campos.valor} onValueChange={(v) => digitar("valor", { valor: v })} error={erros.valor}
            hint={avisoDoValor(campos.valor, escolhido) ? `Difere do lançamento (${valorEmReais(escolhido!.valor)}). Pode salvar assim.` : undefined} /></div>
          <div data-campo="contraparteId"><CampoDeMenu label={entrada ? "Cliente" : "Fornecedor"} required options={opcoesDeContraparte} value={campos.contraparteId || undefined}
            icon={entrada ? <UserRound /> : <Truck />} placeholder={entrada ? "Selecione o cliente" : "Selecione o fornecedor"} sempreComBusca
            dicaDaBusca={entrada ? "Buscar cliente…" : "Buscar fornecedor…"} error={erros.contraparteId}
            onChange={(v) => { if (v !== campos.contraparteId) digitar("contraparteId", { contraparteId: v, lancamento: "" }); }} /></div>
        </div>
      </section>

      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Link2 />}>Vínculo</Heading></div>
        <div data-campo="lancamento"><CampoDeMenu label="Lançamento vinculado" options={opcoesDeLancamento} value={campos.lancamento || SEM_VINCULO} icon={<Link2 />}
          disabled={!campos.empresa} error={erros.lancamento} sempreComBusca dicaDaBusca="Buscar código ou descrição…"
          hint={!campos.empresa ? "Escolha a empresa primeiro." : `Opcional. Só ${entrada ? "cobranças" : "contas a pagar"} da mesma empresa${campos.contraparteId ? ` e do mesmo ${papel}` : ""}.`}
          onChange={escolherLancamento} /></div>
      </section>
    </form>
  </Dialog>;
}

/** Um arquivo só, PDF ou XML: o formato sai dos primeiros bytes, não do nome. */
function ArquivoDaNota({ valor, erro, aoMudar }: {
  valor: CamposDaNota["arquivo"]; erro: string | undefined;
  aoMudar: (arquivo: CamposDaNota["arquivo"], conteudo: File | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    const inicio = new Uint8Array(await arquivo.slice(0, 64).arrayBuffer());
    aoMudar({ nome: arquivo.name, tamanho: arquivo.size, formato: formatoPeloConteudo(inicio) }, arquivo);
  }
  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); void escolher(e.dataTransfer.files[0]); };
  return <div className="ui-field">
    <label htmlFor={id}>Arquivo da nota</label>
    <input ref={input} id={id} hidden type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml"
      onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
    {valor ? <ul className={`ui-file-list ${styles.arquivoEscolhido}`}>
      <li data-invalido={Boolean(erro) || undefined}>
        {valor.formato === "xml" ? <FileCode2 size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
        <span><strong>{valor.nome}</strong><small>{valor.formato ? (valor.formato === "xml" ? "XML" : "PDF") : "Formato não reconhecido"} · {tamanhoDoArquivo(valor.tamanho)}</small></span>
        <Button icon={<XIcon />} iconOnly size="sm" variant="secondary" aria-label={`Remover ${valor.nome}`} onClick={() => aoMudar(null, null)} />
      </li>
    </ul> : <div className={`ui-file-dropzone ${styles.soltar}`} data-dragging={arrastando || undefined}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); }}
      onDrop={soltar}>
      <UploadIcon size={22} aria-hidden="true" />
      <p>Arraste o PDF (DANFE) ou o XML da nota</p>
      <Button variant="secondary" size="sm" icon={<UploadIcon />} onClick={() => input.current?.click()} aria-describedby={`${id}-ajuda`}>Selecionar arquivo</Button>
    </div>}
    <p id={`${id}-ajuda`} className={erro ? "ui-field-error" : "ui-field-hint"} role={erro ? "alert" : undefined}>
      {erro ? `Erro: ${erro}` : "Opcional. Um arquivo, PDF ou XML, até 25 MB. Com o XML da NF-e, os dados da nota são preenchidos."}
    </p>
  </div>;
}
