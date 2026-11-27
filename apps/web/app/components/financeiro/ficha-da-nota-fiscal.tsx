"use client";

import { Download, FileCode2, FileText, Info, Link2, Paperclip } from "lucide-react";

import { tamanhoDoArquivo, valorEmReais } from "../../lib/compras";
import { avisoDoValor, ROTULO_DA_EMPRESA_NA_NOTA, ROTULO_DO_TIPO_DA_NOTA, type NotaFiscal } from "../../lib/notas-fiscais";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button, Dialog, Heading } from "../ui";
import styles from "./notas-fiscais.module.css";

const diaLegivel = (dia: string) => dia.split("-").reverse().join("/");

/** A nota aberta, só para leitura: os dados, o lançamento que ela acompanha e o arquivo. */
export function FichaDaNotaFiscal({ nota, aoFechar }: { nota: NotaFiscal; aoFechar: () => void }) {
  const rotulos = ROTULO_DO_TIPO_DA_NOTA[nota.tipo];
  const empresa = ROTULO_DA_EMPRESA_NA_NOTA[nota.empresa];
  const descricao = nota.tipo === "entrada" ? `Nota de entrada · emitida pela ${empresa} para ${nota.contraparte.nome}` : `Nota de saída · emitida por ${nota.contraparte.nome} para a ${empresa}`;
  const valorDiferente = avisoDoValor(nota.valor, nota.lancamento);
  return <Dialog title={`Nota fiscal nº ${nota.numero}`} description={descricao} icon={<FileText size={20} />} onClose={aoFechar} cancelText="Fechar">
    <div className="ui-dialog-form">
      <section className="ui-dialog-section">
        <dl className={styles.dados}>
          <div><dt>Valor</dt><dd className={styles.valorGrande}>{valorEmReais(nota.valor)}</dd></div>
          <div><dt>Emissão</dt><dd>{diaLegivel(nota.emitidaEm)}</dd></div>
          <div><dt>{rotulos.contraparte}</dt><dd>{nota.contraparte.nome}</dd></div>
          <div><dt>Empresa</dt><dd><EmpresaComPonto empresa={nota.empresa} /></dd></div>
          <div className={styles.dadoLargo}><dt>Registro</dt><dd>Registrada à mão por {nota.registradaPor} em {diaLegivel(nota.registradaEm)}</dd></div>
        </dl>
      </section>

      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Link2 />}>Lançamento vinculado</Heading></div>
        {nota.lancamento ? <div className={styles.cartao}>
          <span className={styles.cartaoIcone} aria-hidden="true"><Link2 size={16} /></span>
          <div className={styles.cartaoTexto}>
            <strong>{nota.lancamento.codigo} · {nota.lancamento.descricao}</strong>
            <small>{valorEmReais(nota.lancamento.valor)} · vence em {diaLegivel(nota.lancamento.vencimento)} · {nota.lancamento.situacao}</small>
          </div>
        </div> : <p className={styles.semVinculo}>
          Sem lançamento vinculado. {nota.tipo === "entrada" ? "Vincule a cobrança do cliente" : "Vincule a conta a pagar do fornecedor"} quando ela existir, para a nota aparecer na ficha do lançamento.
        </p>}
        {valorDiferente ? <p className={styles.alertaValor} role="status">O valor da nota difere do lançamento ({valorEmReais(nota.lancamento!.valor)}).</p> : null}
      </section>

      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Paperclip />}>Arquivo</Heading></div>
        {nota.arquivo ? <div className={styles.cartao}>
          <span className={styles.cartaoIcone} aria-hidden="true">{nota.arquivo.formato === "xml" ? <FileCode2 size={16} /> : <FileText size={16} />}</span>
          <div className={styles.cartaoTexto}>
            <strong>{nota.arquivo.nome}</strong>
            <small>{nota.arquivo.formato === "xml" ? "XML da nota" : "PDF (DANFE)"} · {tamanhoDoArquivo(nota.arquivo.tamanho)}</small>
          </div>
          <Button variant="secondary" size="sm" icon={<Download size={14} />} disabled title="No protótipo o arquivo é de exemplo">Baixar</Button>
        </div> : <p className={styles.semVinculo}>Nenhum arquivo anexado. O PDF ou o XML pode ser anexado depois.</p>}
      </section>

      <p className={styles.notaDoPrototipo}><Info size={14} aria-hidden="true" />Protótipo: no sistema, o código do lançamento abre a ficha dele, o arquivo baixa do armazenamento do Plugga OS, e a nota pode ser corrigida (com histórico) ou cancelada com motivo.</p>
    </div>
  </Dialog>;
}
