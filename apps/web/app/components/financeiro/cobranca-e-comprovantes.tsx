"use client";

import type { ClientesDoFinanceiroResposta, CompanyKey, Lancamento, OpcoesDoFinanceiro, SugestaoDeCobrancaResposta } from "@plugga/shared";
import { Building2, CalendarDays, Download, Landmark, Plus, Receipt, Search, Tag, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { enviar, lerErro } from "../../lib/clientes";
import { categoriasDaEntrada, cobrancaExistente, cobrancaVazia, competenciasParaEscolher, corpoDaCobranca, descricaoSugerida, hrefDoZip, mesesParaBaixar, tiposDoZip, type CamposDaCobranca, type Repetida, type TipoDoZip } from "../../lib/cobranca-manual";
import { hojeEmManaus, ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import { detalheDaConta } from "../../lib/configuracoes-do-financeiro";
import { competenciaLegivel } from "../../lib/financeiro";
import { contasDaEmpresa, valorEmDigitacao } from "../../lib/ficha-do-lancamento";
import estilosCompras from "../compras/compras.module.css";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Checkbox, DatePicker, Dialog, TextField, TextareaField } from "../ui";
import styles from "./ficha.module.css";

type Cliente = ClientesDoFinanceiroResposta["itens"][number];


/**
 * Nova cobrança manual (PLU-337, A7): uma por cliente, empresa e competência, com
 * as UCs dentro (F3) e o valor digitado com a sugestão do último mês (F4). A
 * repetida é recusada com o código da existente, que a tela oferece abrir.
 */
export function NovaCobranca({ opcoes, aoCancelar, aoSalvar, aoAbrirExistente }: {
  opcoes: OpcoesDoFinanceiro; aoCancelar: () => void; aoSalvar: (l: Lancamento) => void; aoAbrirExistente: (id: string) => void;
}) {
  const hoje = hojeEmManaus();
  const [campos, setCampos] = useState<CamposDaCobranca>(() => cobrancaVazia(hoje));
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Cliente[] | null>(null);
  const [sugestao, setSugestao] = useState<SugestaoDeCobrancaResposta | null>(null);
  const [descricaoTocada, setDescricaoTocada] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [repetida, setRepetida] = useState<Repetida | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const mudar = (parcial: Partial<CamposDaCobranca>) => setCampos((c) => ({ ...c, ...parcial }));

  // Busca de clientes (2+ letras), como em Compras: só id, nome e as UCs.
  useEffect(() => {
    if (cliente || busca.trim().length < 2) { setAchados(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<ClientesDoFinanceiroResposta>(`/api/financeiro/clientes?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setAchados(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, cliente]);

  // A sugestão de valor (F4): a cobrança mais recente do mesmo cliente e empresa antes desta competência.
  useEffect(() => {
    setSugestao(null);
    if (!campos.empresa || !campos.clientId || !campos.competencia) return;
    const controle = new AbortController();
    void enviar<SugestaoDeCobrancaResposta>(`/api/financeiro/cobrancas/sugestao?${new URLSearchParams({ empresa: campos.empresa, clientId: campos.clientId, competencia: campos.competencia })}`, "GET", undefined, controle.signal)
      .then((r) => { if (r.ok && r.dados.valor) setSugestao(r.dados); });
    return () => controle.abort();
  }, [campos.empresa, campos.clientId, campos.competencia]);

  const categorias = categoriasDaEntrada(opcoes, campos.empresa);
  /** A descrição acompanha categoria e competência até a pessoa escrever a sua. */
  function comDescricao(parcial: Partial<CamposDaCobranca>) {
    const proximos = { ...campos, ...parcial };
    const categoria = categorias.find((c) => c.id === proximos.categoriaId);
    mudar(descricaoTocada ? parcial : { ...parcial, descricao: categoria ? descricaoSugerida(categoria.nome, proximos.competencia) : "" });
  }

  function escolherCliente(c: Cliente | null) {
    setCliente(c); setBusca(""); setRepetida(null);
    mudar({ clientId: c?.id ?? "", ucIds: c ? c.ucs.map((u) => u.id) : [] });
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const { corpo, porCampo } = corpoDaCobranca(campos);
    setErros(porCampo); setMensagem(null); setRepetida(null);
    if (!corpo) { setMensagem("Confira os campos destacados."); focarErro(); return; }
    setEnviando(true);
    try {
      const resposta = await fetch("/api/financeiro/cobrancas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const dados = await resposta.json().catch(() => null);
      if (resposta.ok) { aoSalvar(dados as Lancamento); return; }
      const existente = resposta.status === 409 ? cobrancaExistente(dados) : null;
      if (existente) {
        setRepetida(existente);
        setMensagem(`Já existe a cobrança ${existente.codigo} de ${cliente?.nome ?? "este cliente"} em ${competenciaLegivel(campos.competencia)} na ${ROTULO_DA_EMPRESA[campos.empresa!]}.`);
        return;
      }
      const erro = lerErro(dados, "Não foi possível criar a cobrança. Tente de novo.");
      setErros(erro.porCampo); setMensagem(erro.mensagem); focarErro();
    } catch {
      setMensagem("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }
  const focarErro = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const empresas = (["plugga", "waze"] as const).map((v) => ({ value: v, label: ROTULO_DA_EMPRESA[v], icon: <Building2 /> }));
  const contas = contasDaEmpresa(opcoes, campos.empresa).map((c) => ({ value: c.id, label: c.nome, ...(detalheDaConta(c) ? { description: detalheDaConta(c) } : {}), icon: <Landmark /> }));

  return <Dialog title="Nova cobrança" icon={<Receipt size={20} />} onClose={aoCancelar}
    description="Uma cobrança por cliente, empresa e competência. Ao criar, o título vai ao OMIE da empresa."
    footer={<Button type="submit" form="form-nova-cobranca" icon={<Plus size={16} />} disabled={enviando}>{enviando ? "Criando…" : "Criar cobrança"}</Button>}>
    <form ref={formRef} id="form-nova-cobranca" className="ui-dialog-form" onSubmit={(e) => void salvar(e)} noValidate>
      {mensagem ? <Alert tone="danger" title={`Erro: ${mensagem}`}>
        {repetida ? <Button variant="secondary" size="sm" onClick={() => aoAbrirExistente(repetida.id)}>Abrir {repetida.codigo}</Button> : null}
      </Alert> : null}
      <Alert tone="info" title="Em breve: gerar as cobranças do mês a partir da Operação mensal." />
      <div className="ui-dialog-grid">
        <CampoDeMenu label="Empresa" required options={empresas} value={campos.empresa ?? undefined} icon={<Building2 />} placeholder="Selecione a empresa" hint="Em qual empresa do OMIE o título entra." error={erros.empresa}
          onChange={(v) => { setRepetida(null); comDescricao({ empresa: v as CompanyKey, categoriaId: "", contaCorrenteId: "" }); }} />
        <CampoDeMenu label="Competência" required options={competenciasParaEscolher(hoje)} value={campos.competencia} icon={<CalendarDays />} hint="O mês do consumo cobrado." error={erros.competencia}
          onChange={(v) => { setRepetida(null); comDescricao({ competencia: v }); }} />
      </div>
      <div className="ui-field">
        <label htmlFor="cobranca-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
        {cliente ? <div className={estilosCompras.escolhido}><span>{cliente.nome}</span><Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${cliente.nome}`} onClick={() => escolherCliente(null)} /></div> : <>
          <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
            <input id="cobranca-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off"
              aria-invalid={erros.clientId ? true : undefined} aria-describedby={erros.clientId ? "cobranca-cliente-erro" : "cobranca-cliente-dica"} /></div>
          {achados ? (achados.length ? <ul className={estilosCompras.resultados} aria-label="Clientes encontrados">{achados.map((c) => <li key={c.id}><button type="button" onClick={() => escolherCliente(c)}>{c.nome}{c.ucs.length ? ` · ${c.ucs.length === 1 ? "1 UC" : `${c.ucs.length} UCs`}` : ""}</button></li>)}</ul>
            : <p className="ui-field-hint" role="status">Nenhum cliente com esse nome.</p>) : <p id="cobranca-cliente-dica" className="ui-field-hint">Busca nos clientes do CRM.</p>}
        </>}
        {erros.clientId ? <p id="cobranca-cliente-erro" className="ui-field-error">Erro: {erros.clientId}</p> : null}
      </div>
      {cliente && cliente.ucs.length ? <fieldset className={styles.ucs}>
        <legend>Unidades consumidoras nesta cobrança</legend>
        {cliente.ucs.map((uc) => <Checkbox key={uc.id} label={uc.codigo} checked={campos.ucIds.includes(uc.id)}
          onChange={(e) => mudar({ ucIds: e.target.checked ? [...campos.ucIds, uc.id] : campos.ucIds.filter((x) => x !== uc.id) })} />)}
      </fieldset> : null}
      <CampoDeMenu label="Categoria (do OMIE)" required options={categorias.map((c) => ({ value: c.id, label: c.nome, description: c.codigo, icon: <Tag />, grupo: `${c.grupo.codigo} · ${c.grupo.nome}` }))} value={campos.categoriaId || undefined} icon={<Tag />}
        placeholder={campos.empresa ? "Selecione a categoria" : "Escolha a empresa primeiro"} disabled={!campos.empresa} error={erros.categoriaId} onChange={(v) => comDescricao({ categoriaId: v })} />
      <TextField label="Descrição" required maxLength={200} value={campos.descricao} onChange={(e) => { setDescricaoTocada(true); mudar({ descricao: e.target.value }); }} placeholder="Ex.: Gestão de energia · out/2026" error={erros.descricao} />
      <div className="ui-dialog-grid">
        <div className={styles.campoDoArquivo}>
          <TextField label="Valor" required inputMode="decimal" prefix="R$" placeholder="0,00" value={campos.valor} onChange={(e) => mudar({ valor: valorEmDigitacao(e.target.value) })} error={erros.valor}
            hint={sugestao?.valor ? `Última cobrança: ${valorEmReais(sugestao.valor)}${sugestao.competencia ? ` em ${competenciaLegivel(sugestao.competencia)}` : ""}${sugestao.codigo ? ` (${sugestao.codigo})` : ""}.` : undefined} />
          {sugestao?.valor ? <Button variant="secondary" size="sm" onClick={() => mudar({ valor: Number(sugestao.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}>Usar {valorEmReais(sugestao.valor)}</Button> : null}
        </div>
        <DatePicker label="Vencimento" required min={hoje} value={campos.vencimento} onChange={(v) => mudar({ vencimento: v })} error={erros.vencimento} />
      </div>
      <CampoDeMenu label="Conta corrente (do OMIE)" options={contas} value={campos.contaCorrenteId || undefined} icon={<Landmark />} placeholder={campos.empresa ? "Opcional" : "Escolha a empresa primeiro"} disabled={!campos.empresa}
        hint="Onde o dinheiro deve entrar, se já souber." error={erros.contaCorrenteId} onChange={(v) => mudar({ contaCorrenteId: v })} />
      <TextareaField label="Observação" maxLength={2000} value={campos.observacao} onChange={(e) => mudar({ observacao: e.target.value })} error={erros.observacao} />
    </form>
  </Dialog>;
}

/**
 * "Baixar comprovantes" (PLU-337): os comprovantes atuais do mês num .zip, com o
 * nome padronizado, para a contabilidade. Até 500 arquivos; acima, a API pede um
 * período menor e a tela mostra o motivo.
 */
export function BaixarComprovantes({ empresaInicial, alcance, aoFechar }: { empresaInicial: CompanyKey | null; alcance: { saidas: boolean; entradas: boolean }; aoFechar: () => void }) {
  const meses = mesesParaBaixar(hojeEmManaus());
  const tipos = tiposDoZip(alcance);
  const [empresa, setEmpresa] = useState<CompanyKey | "">(empresaInicial ?? "");
  const [mes, setMes] = useState(meses[0]!.value);
  const [tipo, setTipo] = useState<TipoDoZip>(tipos[0]!.value);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  async function baixar(evento: FormEvent) {
    evento.preventDefault();
    const periodo = meses.find((m) => m.value === mes)!;
    setBaixando(true); setErro(null);
    try {
      const resposta = await fetch(hrefDoZip({ empresa: empresa || null, de: periodo.de, ate: periodo.ate, tipo }));
      if (!resposta.ok) { setErro(lerErro(await resposta.json().catch(() => null), "Não foi possível montar o .zip. Tente de novo.").mensagem); return; }
      const nome = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(resposta.headers.get("content-disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement("a");
      link.href = url; link.download = nome ? decodeURIComponent(nome) : `comprovantes ${periodo.de} a ${periodo.ate}.zip`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      aoFechar();
    } catch {
      setErro("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  const empresas = [{ value: "", label: "As duas empresas", icon: <Building2 /> }, ...(["plugga", "waze"] as const).map((v) => ({ value: v, label: ROTULO_DA_EMPRESA[v], icon: <Building2 /> }))];
  return <Dialog title="Baixar comprovantes" icon={<Download size={20} />} size="estreita" onClose={aoFechar} cancelText="Voltar"
    description="Os comprovantes do período num arquivo .zip, com o nome padronizado (dia · código · favorecido · valor), para a contabilidade."
    footer={<Button type="submit" form="form-baixar-comprovantes" icon={<Download size={16} />} disabled={baixando}>{baixando ? "Montando o .zip…" : "Baixar .zip"}</Button>}>
    <form id="form-baixar-comprovantes" className="ui-dialog-form" onSubmit={(e) => void baixar(e)} noValidate>
      {erro ? <Alert tone="danger" title={`Erro: ${erro}`} /> : null}
      <CampoDeMenu label="Empresa" options={empresas} value={empresa} icon={<Building2 />} onChange={(v) => setEmpresa(v as CompanyKey | "")} />
      <CampoDeMenu label="Mês" required options={meses.map((m) => ({ value: m.value, label: m.label, icon: <CalendarDays /> }))} value={mes} icon={<CalendarDays />} hint="Pelo dia do pagamento ou do recebimento." onChange={setMes} />
      {tipos.length > 1 ? <CampoDeMenu label="Quais" options={tipos.map((t) => ({ value: t.value, label: t.label, icon: <Receipt /> }))} value={tipo} icon={<Receipt />} onChange={(v) => setTipo(v as TipoDoZip)} /> : null}
      <p className={styles.notaDosAnexos}>Os arquivos já estão guardados nos lançamentos; o .zip só junta os atuais do período, até 500.</p>
    </form>
  </Dialog>;
}
