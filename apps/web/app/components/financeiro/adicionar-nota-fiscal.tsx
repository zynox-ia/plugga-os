"use client";

import type { CompanyKey } from "@plugga/shared";
import { Building2, FileCode2, FileText, Hash, Link2, Paperclip, Plus, Truck, UploadIcon, UserRound, XIcon } from "lucide-react";
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
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, CurrencyField, DatePicker, Dialog, Heading, TextField } from "../ui";
import styles from "./notas-fiscais.module.css";

const SEM_VINCULO = "__sem";

/**
 * "Adicionar nota fiscal" no PROTÓTIPO: o registro manual de uma nota já emitida.
 * O tipo vem do lado escolhido na tela; a empresa, do filtro. Salvar acrescenta a
 * nota à lista em memória (nada vai à API). O arquivo é conferido pelo conteúdo.
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
  const formRef = useRef<HTMLFormElement>(null);
  const focar = useRef(false);
  const mudar = (parcial: Partial<CamposDaNota>) => setCampos((atuais) => ({ ...atuais, ...parcial }));

  const contexto = { hoje, notas, contrapartes, lancamentos, registradaPor: "você (protótipo)", novoId: `nova-${notas.length + 1}-${Date.now()}` };
  // Depois da primeira tentativa, os erros acompanham a digitação.
  const { erros: errosAgora } = validarNota(campos, contexto);
  const chaveDosErros = JSON.stringify(errosAgora);
  useEffect(() => { if (tentou) setErros(JSON.parse(chaveDosErros) as typeof errosAgora); }, [chaveDosErros, tentou]);
  useEffect(() => {
    if (!focar.current) return;
    focar.current = false;
    const primeiro = ORDEM_DOS_CAMPOS.find((c) => erros[c]);
    const alvo = primeiro ? formRef.current?.querySelector<HTMLElement>(`[data-campo="${primeiro}"] :is(input, button, [tabindex])`) : null;
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
    if (tipo !== campos.tipo) mudar({ tipo, contraparteId: "", lancamento: "" });
  }
  function escolherLancamento(codigo: string) {
    if (codigo === SEM_VINCULO) { mudar({ lancamento: "" }); return; }
    const l = lancamentos.find((x) => x.codigo === codigo);
    // Escolher o lançamento completa o cliente (ou fornecedor) e o valor, se ainda vazios.
    mudar({ lancamento: codigo, ...(l && !campos.contraparteId ? { contraparteId: l.contraparteId } : {}), ...(l && !campos.valor ? { valor: l.valor } : {}) });
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
      <Alert tone="info" title="Protótipo com dados de exemplo">A nota entra só na lista desta aba e some ao recarregar a página. Nada é gravado.</Alert>
      {tentou && quantosErros ? <Alert tone="danger" title={quantosErros === 1 ? "Confira o campo destacado." : `Confira os ${quantosErros} campos destacados.`} /> : null}

      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Building2 />}>Tipo e empresa</Heading></div>
        <fieldset className={styles.tipo}>
          <legend>Tipo da nota</legend>
          {(["entrada", "saida"] as const).map((tipo) => <label key={tipo} className={styles.tipoOpcao}>
            <input type="radio" name="tipo-da-nota" value={tipo} checked={campos.tipo === tipo} onChange={() => trocarTipo(tipo)} />
            <span><strong>{tipo === "entrada" ? "Entrada" : "Saída"}</strong><small>{tipo === "entrada" ? "Emitida pela empresa para um cliente" : "Recebida de um fornecedor"}</small></span>
          </label>)}
        </fieldset>
        <div data-campo="empresa">
          <CampoDeMenu label="Empresa" required options={empresas} value={campos.empresa || undefined} icon={<Building2 />} placeholder="Selecione a empresa"
            hint={entrada ? "A empresa que emitiu a nota." : "A empresa que recebeu a nota."} error={erros.empresa}
            onChange={(v) => { if (v !== campos.empresa) mudar({ empresa: v as CompanyKey, lancamento: "" }); }} />
        </div>
      </section>

      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Hash />}>A nota</Heading></div>
        <div className="ui-dialog-grid">
          <div data-campo="numero"><TextField label="Número" required inputMode="numeric" maxLength={14} placeholder="Ex.: 1287" value={campos.numero}
            onChange={(e) => mudar({ numero: e.target.value })} error={erros.numero} hint={erros.numero ? undefined : "Só os algarismos; zeros à esquerda não contam."} /></div>
          <div data-campo="emitidaEm"><DatePicker label="Data de emissão" required max={hoje} value={campos.emitidaEm} onChange={(v) => mudar({ emitidaEm: v })} error={erros.emitidaEm} /></div>
          <div data-campo="valor"><CurrencyField label="Valor" required value={campos.valor} onValueChange={(v) => mudar({ valor: v })} error={erros.valor}
            hint={avisoDoValor(campos.valor, escolhido) ? `Difere do lançamento (${valorEmReais(escolhido!.valor)}). Pode salvar assim.` : undefined} /></div>
          <div data-campo="contraparteId"><CampoDeMenu label={entrada ? "Cliente" : "Fornecedor"} required options={opcoesDeContraparte} value={campos.contraparteId || undefined}
            icon={entrada ? <UserRound /> : <Truck />} placeholder={entrada ? "Selecione o cliente" : "Selecione o fornecedor"} sempreComBusca
            dicaDaBusca={entrada ? "Buscar cliente…" : "Buscar fornecedor…"} error={erros.contraparteId}
            onChange={(v) => { if (v !== campos.contraparteId) mudar({ contraparteId: v, lancamento: "" }); }} /></div>
        </div>
      </section>

      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Paperclip />}>Vínculo e arquivo</Heading></div>
        <div data-campo="lancamento"><CampoDeMenu label="Lançamento vinculado" options={opcoesDeLancamento} value={campos.lancamento || SEM_VINCULO} icon={<Link2 />}
          disabled={!campos.empresa} error={erros.lancamento} sempreComBusca dicaDaBusca="Buscar código ou descrição…"
          hint={!campos.empresa ? "Escolha a empresa primeiro." : `Opcional. Só ${entrada ? "cobranças" : "contas a pagar"} da mesma empresa${campos.contraparteId ? ` e do mesmo ${papel}` : ""}.`}
          onChange={escolherLancamento} /></div>
        <div data-campo="arquivo"><ArquivoDaNota valor={campos.arquivo} erro={erros.arquivo} aoMudar={(arquivo) => mudar({ arquivo })} /></div>
      </section>
    </form>
  </Dialog>;
}

/** Um arquivo só, PDF ou XML: o formato sai dos primeiros bytes, não do nome. */
function ArquivoDaNota({ valor, erro, aoMudar }: { valor: CamposDaNota["arquivo"]; erro: string | undefined; aoMudar: (arquivo: CamposDaNota["arquivo"]) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    const inicio = new Uint8Array(await arquivo.slice(0, 64).arrayBuffer());
    aoMudar({ nome: arquivo.name, tamanho: arquivo.size, formato: formatoPeloConteudo(inicio) });
  }
  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); void escolher(e.dataTransfer.files[0]); };
  return <div className="ui-field">
    <label htmlFor={id}>Arquivo da nota</label>
    <input ref={input} id={id} hidden type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml"
      onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
    {valor ? <ul className="ui-file-list">
      <li data-invalido={Boolean(erro) || undefined}>
        {valor.formato === "xml" ? <FileCode2 size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
        <span><strong>{valor.nome}</strong><small>{valor.formato ? (valor.formato === "xml" ? "XML" : "PDF") : "Formato não reconhecido"} · {tamanhoDoArquivo(valor.tamanho)}</small></span>
        <Button icon={<XIcon />} iconOnly size="sm" variant="secondary" aria-label={`Remover ${valor.nome}`} onClick={() => aoMudar(null)} />
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
      {erro ? `Erro: ${erro}` : "Opcional. Um arquivo, PDF ou XML, até 25 MB; o formato é conferido pelo conteúdo."}
    </p>
  </div>;
}
