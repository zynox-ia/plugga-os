"use client";

import { type AnexoDoLancamento, type Lancamento, type TipoDeAnexo } from "@plugga/shared";
import { Download, FileText, History, Paperclip, ShieldCheck, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";

import { lerErro, type RespostaDeEnvio } from "../../lib/clientes";
import { dataEmManaus, tamanhoDoArquivo, urlDoArquivo } from "../../lib/compras";
import { anexoComVersoes, anexosDaFicha, problemaDoAnexo, ROTULO_DO_ANEXO } from "../../lib/ficha-do-lancamento";
import { Segmentado } from "../compras/campos-de-compra";
import estilosFicha from "../compras/ficha-do-pedido.module.css";
import { Alert, Button, Dialog, FileDropzone } from "../ui";
import styles from "./ficha.module.css";

/** Envia um anexo (multipart: `arquivo` e `tipo`) e devolve o lançamento atualizado. */
export async function enviarAnexo(lancamentoId: string, tipo: TipoDeAnexo, arquivo: File): Promise<RespostaDeEnvio<Lancamento>> {
  const formulario = new FormData();
  formulario.set("tipo", tipo);
  formulario.set("arquivo", arquivo);
  try {
    const resposta = await fetch(`/api/financeiro/lancamentos/${lancamentoId}/anexos`, { method: "POST", body: formulario });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, erro: lerErro(dados, "Não foi possível enviar o arquivo. Tente de novo.") };
    return { ok: true, dados: dados as Lancamento };
  } catch {
    return { ok: false, erro: { mensagem: "Sem conexão com o servidor. Tente de novo.", porCampo: {} } };
  }
}

const quemEnviou = (a: AnexoDoLancamento) => `${dataEmManaus(a.enviado.em)}${a.enviado.por ? ` por ${a.enviado.por.nome}` : ""}`;

function Baixar({ anexo, rotulo }: { anexo: AnexoDoLancamento; rotulo: string }) {
  return <a className="button button--secondary ui-button ui-button--sm" href={urlDoArquivo(anexo.url)} target="_blank" rel="noopener noreferrer" aria-label={rotulo}>
    <span className="ui-button-icon" aria-hidden="true"><Download /></span><span className="ui-button-label">Baixar</span>
  </a>;
}

/**
 * A aba Anexos (PLU-337): comprovante, NF e boleto com as versões que cada um
 * substituiu, e os documentos. Nada se apaga: "Substituir" guarda a anterior.
 */
export function AnexosDoLancamento({ l, ocupado, aoAnexar }: { l: Lancamento; ocupado: boolean; aoAnexar: (tipo: TipoDeAnexo | null) => void }) {
  const grupos = anexosDaFicha(l.arquivos);
  const podeAnexar = !l.cancelado;
  return <div className={estilosFicha.secao}>
    <div className={estilosFicha.barra}>
      <div><h3>Anexos</h3><p>Boleto, NF, comprovante e outros documentos ficam no próprio lançamento, no armazenamento do Plugga OS.</p></div>
      {podeAnexar ? <Button variant="secondary" size="sm" icon={<Upload size={14} />} disabled={ocupado} onClick={() => aoAnexar(null)}>Anexar</Button> : null}
    </div>
    {grupos.length === 0 ? <div className="ui-empty"><span className="ui-empty-mark" aria-hidden="true"><Paperclip size={18} /></span><h3>Sem anexos</h3>
      {podeAnexar ? <p>Anexe o boleto, a NF ou o comprovante em PDF, JPG ou PNG.</p> : null}</div>
      : <ul className={styles.anexos}>
        {grupos.map((g) => {
          const a = g.atual;
          return <li key={g.chave}>
            {a ? <div className={styles.anexoLinha}>
              <FileText size={16} aria-hidden="true" />
              <span className={styles.anexoTexto}>
                <strong>{a.nomePadronizado ?? a.nome}</strong>
                <small>{ROTULO_DO_ANEXO[g.tipo]}{a.nomePadronizado ? ` · enviado como “${a.nome}”` : ""} · {tamanhoDoArquivo(a.tamanhoBytes)} · {quemEnviou(a)}</small>
              </span>
              <span className={styles.anexoAcoes}>
                {podeAnexar && anexoComVersoes(g.tipo) ? <Button variant="secondary" size="sm" icon={<Upload size={14} />} disabled={ocupado} aria-label={`Substituir ${ROTULO_DO_ANEXO[g.tipo].toLowerCase()}`} onClick={() => aoAnexar(g.tipo)}>Substituir</Button> : null}
                <Baixar anexo={a} rotulo={`Baixar ${a.nomePadronizado ?? a.nome}`} />
              </span>
            </div> : <p className={styles.anexoTexto}><strong>{ROTULO_DO_ANEXO[g.tipo]}</strong><small>Só versões anteriores.</small></p>}
            {g.anteriores.length ? <div className={styles.versoes}>
              <span className={styles.versoesTitulo}>Versões anteriores</span>
              <ol>
                {g.anteriores.map((v) => <li key={v.id}>
                  <History size={13} aria-hidden="true" />
                  <span>{v.nome} · enviado {quemEnviou(v)}{v.substituido ? ` · substituído ${dataEmManaus(v.substituido.em)}${v.substituido.por ? ` por ${v.substituido.por.nome}` : ""}` : ""}</span>
                  <Baixar anexo={v} rotulo={`Baixar a versão anterior ${v.nome}`} />
                </li>)}
              </ol>
            </div> : null}
          </li>;
        })}
      </ul>}
    <p className={styles.notaDosAnexos}><ShieldCheck size={14} aria-hidden="true" /><span>Nada se apaga: substituir o comprovante, a NF ou o boleto guarda a versão anterior, que continua disponível para baixar.</span></p>
  </div>;
}

const OPCOES_DE_TIPO = (["comprovante", "nf", "boleto", "documento"] as const).map((t) => ({ valor: t, rotulo: ROTULO_DO_ANEXO[t] }));

/** Anexar (tipo e arquivo) ou substituir um tipo já escolhido. */
export function AnexarArquivo({ l, tipoInicial, aoVoltar, aoEnviar }: {
  l: Pick<Lancamento, "codigo" | "arquivos">;
  /** Substituir: o tipo vem fixo. */
  tipoInicial: TipoDeAnexo | null;
  aoVoltar: () => void;
  aoEnviar: (tipo: TipoDeAnexo, arquivo: File) => Promise<string | null>;
}) {
  const [tipo, setTipo] = useState<TipoDeAnexo | null>(tipoInicial ?? "documento");
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const substituir = tipoInicial !== null;
  const temAtual = tipo !== null && anexoComVersoes(tipo) && l.arquivos.some((a) => a.tipo === tipo && !a.substituido);

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    const problema = tipo ? problemaDoAnexo(arquivo[0]) : "escolha o tipo do anexo.";
    if (problema) { setErro(problema); return; }
    setEnviando(true); setErro(null);
    const falha = await aoEnviar(tipo!, arquivo[0]!);
    setEnviando(false);
    if (falha) setErro(falha);
  }

  return <Dialog title={substituir ? `Substituir ${ROTULO_DO_ANEXO[tipoInicial].toLowerCase()} de ${l.codigo}` : `Anexar a ${l.codigo}`} size="estreita" icon={<Upload size={20} />}
    description="PDF, JPG ou PNG até 25 MB. Fica guardado no armazenamento do Plugga OS."
    onClose={aoVoltar} cancelText="Voltar"
    footer={<Button type="submit" form="form-anexar-lancamento" icon={<Upload size={15} />} disabled={enviando}>{enviando ? "Enviando…" : substituir ? "Substituir" : "Anexar"}</Button>}>
    <form id="form-anexar-lancamento" className="ui-dialog-form" onSubmit={confirmar} noValidate>
      {erro ? <Alert tone="danger" title={`Erro: ${erro}`} /> : null}
      {substituir ? null : <Segmentado rotulo="Tipo" obrigatorio valor={tipo} aoMudar={(t) => setTipo(t)} opcoes={OPCOES_DE_TIPO} />}
      {temAtual ? <p className={styles.notaDosAnexos}><History size={14} aria-hidden="true" /><span>Já há {tipo === "nf" ? "uma" : "um"} {ROTULO_DO_ANEXO[tipo!].toLowerCase()} anexad{tipo === "nf" ? "a" : "o"}: o novo substitui, e o anterior fica nas versões anteriores.</span></p> : null}
      <FileDropzone label="Arquivo" value={arquivo} disabled={enviando} onChange={(arquivos) => { setArquivo(arquivos.slice(-1)); setErro(null); }} />
    </form>
  </Dialog>;
}
