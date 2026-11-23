"use client";

import { camposDaImportacao, companyKeys, MAPEAMENTO_PADRAO_DA_IMPORTACAO, PLANILHA_DE_USINAS_MAX_BYTES, type CampoDaImportacao, type CompanyKey, type ImportacaoDeUsinas } from "@plugga/shared";
import { Building2, Check, FileSpreadsheet, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";

import { lerErro } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { kwpLegivel } from "../../lib/usinas";
import estilosConfig from "../financeiro/configuracoes.module.css";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, FileDropzone, TextField } from "../ui";
import styles from "./usinas.module.css";

const ROTULO_DO_CAMPO: Record<CampoDaImportacao, string> = {
  cliente: "Cliente", uc: "UC", nome: "Nome da usina", plataforma: "Plataforma", potenciaKwp: "Potência (kWp)",
  fabricante: "Fabricante", modelo: "Modelo", numeroSerie: "Número de série", comissionadaEm: "Comissionamento", empresa: "Empresa",
};
const ROTULO_DA_LINHA = { pronta: "Pronta", ja_existe: "Já existe", erro: "Com erro", gravada: "Gravada" } as const;

/**
 * Importação da planilha de levantamento (E3, uma vez): o CSV (vírgula ou ponto e
 * vírgula), a empresa das linhas sem a coluna Empresa e os cabeçalhos. Primeiro
 * confere (nada é gravado), depois grava as linhas prontas numa transação só.
 * O arquivo é lido só em memória pela API: nunca é guardado nem logado.
 */
export function ImportarUsinas({ empresaInicial, aoCancelar, aoGravar }: { empresaInicial?: CompanyKey; aoCancelar: () => void; aoGravar: (gravadas: number) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [empresa, setEmpresa] = useState<CompanyKey | "">(empresaInicial ?? "");
  const [mapeamento, setMapeamento] = useState<Record<CampoDaImportacao, string>>({ ...MAPEAMENTO_PADRAO_DA_IMPORTACAO });
  const [verCabecalhos, setVerCabecalhos] = useState(false);
  const [conferencia, setConferencia] = useState<ImportacaoDeUsinas | null>(null);
  const [erros, setErros] = useState<{ arquivo?: string; empresa?: string }>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(gravar: boolean): Promise<ImportacaoDeUsinas | null> {
    const problemas = {
      arquivo: !arquivo ? "escolha a planilha (CSV)." : !/\.csv$/i.test(arquivo.name) ? "envie a planilha em CSV (salve como CSV no Excel)." : arquivo.size > PLANILHA_DE_USINAS_MAX_BYTES ? "a planilha passa de 2 MB." : undefined,
      empresa: empresa ? undefined : "escolha a empresa das linhas sem a coluna Empresa.",
    };
    setErros(problemas);
    if (problemas.arquivo || problemas.empresa || !arquivo) return null;
    const form = new FormData();
    form.set("arquivo", arquivo);
    form.set("empresaPadrao", empresa);
    form.set("mapeamento", JSON.stringify(Object.fromEntries(Object.entries(mapeamento).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))));
    form.set("gravar", gravar ? "sim" : "nao");
    setEnviando(true); setFalha(null);
    try {
      const resposta = await fetch("/api/engenharia/usinas/importacao", { method: "POST", body: form });
      const dados = await resposta.json().catch(() => null);
      if (resposta.ok) return dados as ImportacaoDeUsinas;
      setFalha(lerErro(dados, "Não foi possível ler a planilha. Tente de novo.").mensagem);
      return null;
    } catch {
      setFalha("Sem conexão com o servidor. Tente de novo.");
      return null;
    } finally {
      setEnviando(false);
    }
  }

  async function conferir(evento: FormEvent) {
    evento.preventDefault();
    const r = await enviar(false);
    if (!r) return;
    setConferencia(r);
    // O resultado fica abaixo do formulário: leva a pessoa até ele.
    requestAnimationFrame(() => document.getElementById("resultado-da-importacao")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  async function gravar() {
    const r = await enviar(true);
    if (r?.gravou) aoGravar(r.resumo.gravadas);
    else if (r) setConferencia(r);
  }

  const resumo = conferencia?.resumo;
  return <Dialog title="Importar planilha de usinas" size="larga" className={estilosConfig.telaCheia} icon={<FileSpreadsheet size={20} />} onClose={aoCancelar}
    description="A planilha de levantamento entra uma vez no cadastro. Primeiro conferimos as linhas; nada é gravado até você confirmar."
    footer={conferencia && resumo && resumo.prontas > 0
      ? <Button icon={<Check size={15} />} disabled={enviando} onClick={() => void gravar()}>{enviando ? "Gravando…" : `Gravar ${resumo.prontas} ${resumo.prontas === 1 ? "usina" : "usinas"}`}</Button>
      : <Button type="submit" form="form-importar" icon={<Upload size={15} />} disabled={enviando}>{enviando ? "Conferindo…" : "Conferir a planilha"}</Button>}>
    <form id="form-importar" className="ui-dialog-form" onSubmit={conferir} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <div className="ui-field">
        <FileDropzone label="Planilha (CSV, até 2 MB e 2.000 linhas)" value={arquivo ? [arquivo] : []} disabled={enviando}
          onChange={(xs) => { setArquivo(xs.at(-1) ?? null); setConferencia(null); setErros((e) => ({ ...e, arquivo: undefined })); }} />
        {erros.arquivo ? <p className="ui-field-error" role="alert">Erro: {erros.arquivo}</p> : null}
      </div>
      <CampoDeMenu label="Empresa das linhas sem a coluna Empresa" required icon={<Building2 />} placeholder="Selecione a empresa" value={empresa || undefined}
        onChange={(v) => { setEmpresa(v as CompanyKey); setConferencia(null); setErros((e) => ({ ...e, empresa: undefined })); }} error={erros.empresa}
        options={companyKeys.map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }))} />
      <button type="button" className={styles.linkBotao} aria-expanded={verCabecalhos} onClick={() => setVerCabecalhos((v) => !v)}>{verCabecalhos ? "Esconder os cabeçalhos" : "A planilha usa outros cabeçalhos?"}</button>
      {verCabecalhos ? <fieldset className={styles.cabecalhos}>
        <legend>Cabeçalho de cada campo na planilha</legend>
        {camposDaImportacao.map((c) => <TextField key={c} label={ROTULO_DO_CAMPO[c]} maxLength={80} value={mapeamento[c]} onChange={(e) => { setMapeamento((m) => ({ ...m, [c]: e.target.value })); setConferencia(null); }} />)}
      </fieldset> : null}

      {conferencia && resumo ? <section id="resultado-da-importacao" className={styles.resultadoDaImportacao} aria-label="Resultado da conferência" tabIndex={-1}>
        <p role="status"><strong>{resumo.linhas} {resumo.linhas === 1 ? "linha" : "linhas"}:</strong> {resumo.prontas} {resumo.prontas === 1 ? "pronta" : "prontas"} · {resumo.jaExistem} já {resumo.jaExistem === 1 ? "existe" : "existem"} · {resumo.erros} com erro{conferencia.gravou ? ` · ${resumo.gravadas} gravadas` : ""}</p>
        <div className={estilosConfig.tabela}><div className={estilosConfig.rolagem} role="region" aria-label="Linhas da planilha" tabIndex={0}>
          <table>
            <caption className="sr-only">Linhas da planilha e o que acontece com cada uma</caption>
            <thead><tr><th scope="col">Linha</th><th scope="col">Usina</th><th scope="col">Situação</th><th scope="col">Problemas</th></tr></thead>
            <tbody>{conferencia.linhas.map((l) => <tr key={l.linha}>
              <td data-l="Linha">{l.linha}</td>
              <td data-l="Usina">{l.usina ? <span className={styles.usinaDaLinha}><strong>{l.usina.nome}</strong><small>{l.usina.cliente} · UC {l.usina.uc} · {l.usina.plataforma} · {kwpLegivel(l.usina.potenciaKwp)} kWp · {ROTULO_DA_EMPRESA[l.usina.empresa].split(" ")[0]}</small></span> : "—"}</td>
              <td data-l="Situação"><span className={styles.situacaoFeita} data-situacao={l.situacao === "erro" ? "anomalia" : "normal"}>{ROTULO_DA_LINHA[l.situacao]}</span></td>
              <td data-l="Problemas">{l.problemas.length ? <ul className={styles.problemas}>{l.problemas.map((p) => <li key={p}>{p}</li>)}</ul> : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div></div>
        {resumo.prontas === 0 ? <p className={styles.muted}>Nenhuma linha pronta para gravar. Corrija a planilha e confira de novo.</p> : null}
      </section> : null}
    </form>
  </Dialog>;
}
