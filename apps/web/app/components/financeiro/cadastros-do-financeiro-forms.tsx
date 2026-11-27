"use client";

import { naturezasDeCategoria, type CategoriaEditada, type CategoriaFinanceira, type CompanyKey, type ContaCorrente } from "@plugga/shared";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, Landmark, Pencil, Plus, Save, Tag } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  camposDaCategoria, camposDaConta, categoriaDasTarifas, corpoDaCategoria, corpoDaConta, grupoEditavel, nomeDoGrupo, ROTULO_DA_NATUREZA, saldoDigitado, saldoParaDigitar,
  type CamposDaCategoria, type CamposDaConta, type ErrosDe,
} from "../../lib/cadastros-do-financeiro";
import { enviar } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { CampoDeMenu, type OpcaoDoMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Checkbox, DatePicker, Dialog, Heading, TextField } from "../ui";
import styles from "./configuracoes.module.css";
import { ICONE_DA_NATUREZA } from "./partes";

const EMPRESAS: OpcaoDoMenu[] = (["plugga", "waze"] as const).map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <Building2 /> }));

/** Os erros da API por campo, só dos campos do formulário. */
function errosDaApi<T extends object>(porCampo: Record<string, string>, campos: T): ErrosDe<T> {
  return Object.fromEntries(Object.entries(porCampo).filter(([k]) => k in campos)) as ErrosDe<T>;
}

/** Nova conta corrente e Editar: nome, banco, agência, número, o saldo inicial com o dia dele e a situação. A empresa não muda depois. */
export function ContaCorrenteForm({ conta, empresa, aoCancelar, aoSalvar }: {
  conta?: ContaCorrente; empresa: CompanyKey | null; aoCancelar: () => void; aoSalvar: (salva: ContaCorrente, aviso: string) => void;
}) {
  const [campos, setCampos] = useState<CamposDaConta>(() => camposDaConta(conta, empresa));
  const [erros, setErros] = useState<ErrosDe<CamposDaConta>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (parcial: Partial<CamposDaConta>) => {
    setCampos((c) => ({ ...c, ...parcial }));
    setErros((e) => ({ ...e, ...Object.fromEntries(Object.keys(parcial).map((k) => [k, undefined])) }));
  };

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const r = corpoDaConta(campos, conta);
    if (!r.ok) { setErros(r.erros); return; }
    if (conta && Object.keys(r.corpo).length === 0) { aoCancelar(); return; }
    setEnviando(true); setFalha(null);
    const resposta = conta
      ? await enviar<ContaCorrente>(`/api/financeiro/contas-correntes/${conta.id}`, "PATCH", r.corpo)
      : await enviar<ContaCorrente>("/api/financeiro/contas-correntes", "POST", r.corpo);
    setEnviando(false);
    if (resposta.ok) { aoSalvar(resposta.dados, conta ? `${resposta.dados.nome} atualizada.` : `${resposta.dados.nome} cadastrada.`); return; }
    setErros(errosDaApi(resposta.erro.porCampo, campos));
    setFalha(resposta.erro.mensagem);
  }

  return <Dialog title={conta ? `Editar ${conta.nome}` : "Nova conta corrente"} className={styles.telaCheia} icon={conta ? <Pencil size={20} /> : <Landmark size={20} />} onClose={aoCancelar}
    description={conta ? "A empresa não muda. Inativa, a conta sai dos menus; os lançamentos dela continuam." : "A conta entra nos menus dos lançamentos e na Conciliação da empresa."}
    footer={<Button type="submit" form="form-conta-corrente" icon={conta ? <Save size={16} /> : <Plus size={16} />} disabled={enviando}>{enviando ? "Salvando…" : conta ? "Salvar alterações" : "Cadastrar conta"}</Button>}>
    <form id="form-conta-corrente" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Landmark />}>A conta</Heading></div>
        <div className="ui-dialog-grid">
          <CampoDeMenu label="Empresa" required options={EMPRESAS} value={campos.empresa || undefined} icon={<Building2 />} placeholder="Selecione a empresa"
            disabled={!!conta} hint={conta ? "A empresa não muda depois de criada." : undefined} error={erros.empresa} onChange={(v) => mudar({ empresa: v as CompanyKey })} />
          <TextField label="Nome" required maxLength={120} autoFocus={!conta} value={campos.nome} onChange={(e) => mudar({ nome: e.target.value })} error={erros.nome} placeholder="Ex.: Itaú PJ" />
        </div>
        <TextField label="Banco" maxLength={80} value={campos.banco} onChange={(e) => mudar({ banco: e.target.value })} error={erros.banco} placeholder="Ex.: Itaú" hint="O caixa não tem banco, agência nem número." />
        <div className="ui-dialog-grid">
          <TextField label="Agência" maxLength={20} inputMode="numeric" value={campos.agencia} onChange={(e) => mudar({ agencia: e.target.value })} error={erros.agencia} placeholder="0412" />
          <TextField label="Número da conta" maxLength={30} value={campos.numero} onChange={(e) => mudar({ numero: e.target.value })} error={erros.numero} placeholder="23456-7" />
        </div>
      </section>
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<CalendarDays />}>Saldo inicial</Heading>
          <p className="ui-field-hint">O ponto de partida do saldo no Plugga OS: daí em diante entram o pago, o recebido e o conciliado.</p></div>
        <div className="ui-dialog-grid">
          <TextField label="Saldo" inputMode="decimal" prefix="R$" placeholder="0,00" maxLength={20} value={campos.saldoInicial} error={erros.saldoInicial}
            hint="Pode ser negativo, como -200,00." onChange={(e) => mudar({ saldoInicial: e.target.value.replace(/[^\d.,\-−]/g, "") })}
            onBlur={() => { const v = saldoDigitado(campos.saldoInicial); if (v) mudar({ saldoInicial: saldoParaDigitar(v) }); }} />
          <DatePicker label="Dia do saldo" value={campos.saldoInicialEm} onChange={(v) => mudar({ saldoInicialEm: v })} error={erros.saldoInicialEm}
            hint={conta?.saldoInicial ? "Apague o saldo e o dia para tirar o saldo inicial." : undefined} />
        </div>
      </section>
      {conta ? <Checkbox label="Ativa" description="Inativa, sai dos menus dos lançamentos e da Conciliação; os lançamentos dela continuam" checked={campos.ativa} onChange={(e) => mudar({ ativa: e.target.checked })} /> : null}
    </form>
  </Dialog>;
}

const TIPOS: OpcaoDoMenu[] = [
  { value: "despesa", label: "Despesa", icon: <ArrowUpRight /> },
  { value: "receita", label: "Receita", icon: <ArrowDownLeft /> },
];
const NATUREZAS: OpcaoDoMenu[] = naturezasDeCategoria.map((n) => { const Icone = ICONE_DA_NATUREZA[n]; return { value: n, label: ROTULO_DA_NATUREZA[n], icon: <Icone /> }; });

/**
 * Nova categoria e Editar. Código, tipo e empresa não mudam depois. O grupo é o prefixo
 * do código ("2.01"): se já existe na empresa, o nome vem dele. A categoria das tarifas
 * bancárias é uma por empresa; marcar esta tira a marca da anterior.
 */
export function CategoriaForm({ categoria, categorias, empresa, aoCancelar, aoSalvar }: {
  categoria?: CategoriaFinanceira; categorias: readonly CategoriaFinanceira[]; empresa: CompanyKey | null;
  aoCancelar: () => void; aoSalvar: (salva: CategoriaEditada, aviso: string) => void;
}) {
  const [campos, setCampos] = useState<CamposDaCategoria>(() => camposDaCategoria(categoria, empresa));
  const [erros, setErros] = useState<ErrosDe<CamposDaCategoria>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (parcial: Partial<CamposDaCategoria>) => {
    setCampos((c) => ({ ...c, ...parcial }));
    setErros((e) => ({ ...e, ...Object.fromEntries(Object.keys(parcial).map((k) => [k, undefined])) }));
  };

  // Na nova, o grupo que já existe na empresa dá o nome; na edição, só a categoria sozinha renomeia o grupo.
  const grupoExistente = !categoria && campos.empresa ? nomeDoGrupo(categorias, campos.empresa, campos.codigo) : null;
  const grupoTravado = categoria ? !grupoEditavel(categorias, categoria) : grupoExistente !== null;
  const grupoNome = grupoExistente ?? campos.grupoNome;
  const prefixo = (categoria?.codigo ?? campos.codigo).trim().split(".").slice(0, 2).join(".");
  const tipo = categoria?.tipo ?? campos.tipo;
  const marcada = campos.empresa ? categoriaDasTarifas(categorias, campos.empresa) : null;
  const outraMarcada = marcada && marcada.id !== categoria?.id ? marcada : null;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const r = corpoDaCategoria({ ...campos, grupoNome }, categorias, categoria);
    if (!r.ok) { setErros(r.erros); return; }
    if (categoria && Object.keys(r.corpo).length === 0) { aoCancelar(); return; }
    setEnviando(true); setFalha(null);
    const resposta = categoria
      ? await enviar<CategoriaEditada>(`/api/financeiro/categorias/${categoria.id}`, "PATCH", r.corpo)
      : await enviar<CategoriaEditada>("/api/financeiro/categorias", "POST", r.corpo);
    setEnviando(false);
    if (resposta.ok) {
      const d = resposta.dados;
      const troca = d.desmarcada ? ` ${d.desmarcada.codigo} · ${d.desmarcada.nome} deixou de ser a das tarifas bancárias.` : "";
      aoSalvar(d, `${d.codigo} · ${d.nome} ${categoria ? "atualizada" : "cadastrada"}.${troca}`);
      return;
    }
    setErros(errosDaApi(resposta.erro.porCampo, campos));
    setFalha(resposta.erro.mensagem);
  }

  return <Dialog title={categoria ? `Editar ${categoria.codigo} · ${categoria.nome}` : "Nova categoria"} className={styles.telaCheia} icon={categoria ? <Pencil size={20} /> : <Tag size={20} />} onClose={aoCancelar}
    description={categoria ? "Código, tipo e empresa não mudam. Inativa, a categoria sai dos menus; os lançamentos dela continuam." : "A categoria entra no plano de contas da empresa e nos menus dos lançamentos."}
    footer={<Button type="submit" form="form-categoria" icon={categoria ? <Save size={16} /> : <Plus size={16} />} disabled={enviando}>{enviando ? "Salvando…" : categoria ? "Salvar alterações" : "Cadastrar categoria"}</Button>}>
    <form id="form-categoria" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Tag />}>A categoria</Heading></div>
        <div className="ui-dialog-grid">
          <CampoDeMenu label="Empresa" required options={EMPRESAS} value={campos.empresa || undefined} icon={<Building2 />} placeholder="Selecione a empresa"
            disabled={!!categoria} hint={categoria ? "A empresa não muda depois de criada." : "Cada empresa tem o seu plano de contas."} error={erros.empresa}
            onChange={(v) => mudar({ empresa: v as CompanyKey })} />
          <CampoDeMenu label="Tipo" required options={TIPOS} value={tipo} icon={tipo === "receita" ? <ArrowDownLeft /> : <ArrowUpRight />} disabled={!!categoria}
            hint={categoria ? "O tipo não muda depois de criada." : undefined}
            onChange={(v) => {
              const novo = v as CamposDaCategoria["tipo"];
              const natureza = novo === "receita" && campos.natureza === "outros" ? "receita" : novo === "despesa" && campos.natureza === "receita" ? "outros" : campos.natureza;
              mudar({ tipo: novo, natureza, ...(novo === "receita" ? { tarifaBancaria: false } : {}) });
            }} />
        </div>
        <div className="ui-dialog-grid">
          <TextField label="Código" required={!categoria} maxLength={7} inputMode="decimal" value={categoria?.codigo ?? campos.codigo} readOnly={!!categoria} disabled={!!categoria}
            onChange={(e) => mudar({ codigo: e.target.value.replace(/[^\d.]/g, "") })} error={erros.codigo} placeholder="2.01.01"
            hint={categoria ? "O código não muda depois de criada." : "Grupo, subgrupo e item, como 2.01.01."} />
          <TextField label="Nome" required maxLength={120} autoFocus={!categoria} value={campos.nome} onChange={(e) => mudar({ nome: e.target.value })} error={erros.nome} placeholder="Ex.: Correios e entregas" />
        </div>
        <TextField label={prefixo && /^\d\.\d{2}$/.test(prefixo) ? `Nome do grupo ${prefixo}` : "Nome do grupo"} required maxLength={80} value={grupoNome} readOnly={grupoTravado} disabled={grupoTravado}
          onChange={(e) => mudar({ grupoNome: e.target.value })} error={erros.grupoNome} placeholder="Ex.: Despesas administrativas"
          hint={grupoTravado ? `O nome vale para todas as categorias do ${prefixo}; renomear o grupo inteiro ainda não está disponível.` : "Os dois primeiros níveis do código formam o grupo."} />
        <CampoDeMenu label="Natureza" required options={NATUREZAS} value={campos.natureza} icon={(() => { const Icone = ICONE_DA_NATUREZA[campos.natureza]; return <Icone />; })()}
          hint="Dá o ícone da categoria nos cards e nas listas." onChange={(v) => mudar({ natureza: v as CamposDaCategoria["natureza"] })} />
      </section>
      {tipo === "despesa" || categoria ? <section className="ui-dialog-section">
        {tipo === "despesa" ? <Checkbox label="Categoria das tarifas bancárias" checked={campos.tarifaBancaria} disabled={!campos.ativa}
          description={!campos.ativa ? "Categoria inativa não pode ser a das tarifas." : outraMarcada ? `Usada no "Criar tarifa" da Conciliação. Hoje é a ${outraMarcada.codigo} · ${outraMarcada.nome}, que deixa de ser.` : "Usada no \"Criar tarifa\" da Conciliação. Uma por empresa."}
          aria-invalid={erros.tarifaBancaria ? true : undefined} onChange={(e) => mudar({ tarifaBancaria: e.target.checked })} /> : null}
        {erros.tarifaBancaria ? <p className="ui-field-error">Erro: {erros.tarifaBancaria}</p> : null}
        {categoria ? <Checkbox label="Ativa" description={categoria.tarifaBancaria ? "Inativa, sai dos menus e deixa de ser a das tarifas bancárias; os lançamentos dela continuam" : "Inativa, sai dos menus dos lançamentos; os lançamentos dela continuam"}
          checked={campos.ativa} onChange={(e) => mudar({ ativa: e.target.checked, ...(e.target.checked ? {} : { tarifaBancaria: false }) })} /> : null}
      </section> : null}
    </form>
  </Dialog>;
}
