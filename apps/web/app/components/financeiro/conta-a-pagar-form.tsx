"use client";

import { formasDoLancamento, type Lancamento, type OpcoesDoFinanceiro } from "@plugga/shared";
import { Building2, CreditCard, FileText, Landmark, Lock, Pencil, Plus, Receipt, Save, Tag, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { decimalDigitado, hojeEmManaus, ROTULO_DA_EMPRESA } from "../../lib/compras";
import {
  camposDoLancamento,
  camposTravadosNaAprovada,
  categoriasDaSaida,
  contaAPagarVazia,
  contasDaEmpresa,
  corpoDaEdicao,
  corpoDaNovaContaAPagar,
  ROTULO_DA_FORMA,
  valorEmDigitacao,
  type CamposDaContaAPagar,
} from "../../lib/ficha-do-lancamento";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, Heading, TextField, TextareaField } from "../ui";
import { displayCurrency } from "../ui/currency-value";

/**
 * Nova conta a pagar avulsa (contabilidade, imposto, assinatura, reembolso).
 * Nasce aberta e espera a aprovação da Gerente do Financeiro. Com `lancamento`,
 * o mesmo formulário edita a conta antes de pagar e envia só o que mudou.
 * A Empresa vem antes de Categoria e Conta, que dependem dela.
 */
export function ContaAPagarForm({ opcoes, lancamento, gerente, aoCancelar, aoSalvar }: {
  opcoes: OpcoesDoFinanceiro;
  lancamento?: Lancamento;
  /** Gerente do Financeiro (ou plataforma): muda tudo na conta aprovada. */
  gerente: boolean;
  aoCancelar: () => void;
  aoSalvar: (lancamento: Lancamento) => void;
}) {
  const editando = Boolean(lancamento);
  const inicial = useMemo(() => (lancamento ? camposDoLancamento(lancamento) : contaAPagarVazia()), [lancamento]);
  const [campos, setCampos] = useState<CamposDaContaAPagar>(inicial);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focar = useRef(false);
  const travados = lancamento ? camposTravadosNaAprovada(lancamento, gerente) : false;

  useEffect(() => {
    if (!erro || !focar.current) return;
    focar.current = false;
    const alvo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]');
    if (alvo?.getAttribute("role") === "alert") alvo.setAttribute("tabindex", "-1");
    alvo?.focus(); alvo?.scrollIntoView({ block: "center" });
  }, [erro]);

  const mudar = (parcial: Partial<CamposDaContaAPagar>) => setCampos((atuais) => ({ ...atuais, ...parcial }));
  const e = (campo: string) => erro?.porCampo[campo];

  const fornecedores = useMemo(() => {
    const lista = opcoes.fornecedores.map((f) => ({ value: f.id, label: f.nome, icon: <Truck /> }));
    // O fornecedor da conta pode ter sido inativado depois: continua aparecendo na edição.
    if (lancamento && !lista.some((f) => f.value === lancamento.favorecido.id)) lista.unshift({ value: lancamento.favorecido.id, label: lancamento.favorecido.nome, icon: <Truck /> });
    return lista;
  }, [opcoes.fornecedores, lancamento]);
  const categorias = categoriasDaSaida(opcoes, campos.empresa, lancamento?.categoria.id).map((c) => ({ value: c.id, label: c.nome, description: c.codigo, icon: <Tag />, grupo: `${c.grupo.codigo} · ${c.grupo.nome}` }));
  const contas = contasDaEmpresa(opcoes, campos.empresa, lancamento?.contaCorrente?.id).map((c) => ({ value: c.id, label: c.nome, ...(c.banco ? { description: [c.banco, c.agencia ? `ag ${c.agencia}` : null, c.numero ? `cc ${c.numero}` : null].filter(Boolean).join(" · ") } : {}), icon: <Landmark /> }));
  const formas = formasDoLancamento.map((f) => ({ value: f, label: ROTULO_DA_FORMA[f], icon: <CreditCard /> }));
  const empresas = (["plugga", "waze"] as const).map((v) => ({ value: v, label: ROTULO_DA_EMPRESA[v], icon: <Building2 /> }));
  const dicaTravado = travados ? "Na conta aprovada, só a Gerente do Financeiro muda este campo." : undefined;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    let corpo: Record<string, unknown> | undefined;
    let porCampo: Record<string, string>;
    if (lancamento) ({ corpo, porCampo } = corpoDaEdicao(inicial, campos));
    else ({ corpo, porCampo } = corpoDaNovaContaAPagar(campos));
    if (Object.keys(porCampo).length || !corpo) { focar.current = true; setErro({ mensagem: "Confira os campos destacados.", porCampo }); return; }
    if (lancamento && Object.keys(corpo).length === 0) { aoCancelar(); return; }
    setEnviando(true); setErro(null);
    const r = await enviar<Lancamento>(lancamento ? `/api/financeiro/lancamentos/${lancamento.id}` : "/api/financeiro/lancamentos", lancamento ? "PATCH" : "POST", corpo);
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    focar.current = true; setErro(r.erro);
  }

  return <Dialog title={editando ? `Editar ${lancamento!.codigo}` : "Nova conta a pagar"}
    description={editando ? "Altere a conta antes do pagamento. A empresa e o valor não mudam aqui." : "Pedido avulso (contabilidade, imposto, assinatura, reembolso). Nasce aberta e segue para a aprovação da Gerente do Financeiro."}
    icon={editando ? <Pencil size={20} /> : <Receipt size={20} />} onClose={aoCancelar}
    footer={<Button type="submit" form="form-conta-a-pagar" icon={editando ? <Save size={16} /> : <Plus size={16} />} disabled={enviando}>{enviando ? (editando ? "Salvando…" : "Criando…") : editando ? "Salvar alterações" : "Criar conta"}</Button>}>
    <form ref={formRef} id="form-conta-a-pagar" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {erro?.mensagem ? <Alert tone="danger" title={erro.mensagem} /> : null}
      {travados ? <Alert tone="info" title="Conta aprovada">Fornecedor, conta corrente, forma e vencimento só mudam pela Gerente do Financeiro. A descrição e a observação continuam livres.</Alert> : null}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<Building2 />}>Para quem e de qual empresa</Heading></div>
        <div className="ui-dialog-grid">
          <CampoDeMenu label="Empresa" required options={empresas} value={campos.empresa ?? undefined} icon={<Building2 />} placeholder="Selecione a empresa"
            disabled={editando} hint={editando ? "A empresa não muda depois de criada." : "Decide em qual empresa do OMIE a conta entra."} error={e("empresa")}
            onChange={(v) => { const empresa = v as CamposDaContaAPagar["empresa"]; if (empresa !== campos.empresa) mudar({ empresa, categoriaId: "", contaCorrenteId: "" }); }} />
          <CampoDeMenu label="Fornecedor ou favorecido" required options={fornecedores} value={campos.fornecedorId || undefined} icon={<Truck />} placeholder="Selecione"
            disabled={travados} hint={dicaTravado} error={e("fornecedorId")} onChange={(v) => mudar({ fornecedorId: v })} />
        </div>
      </section>
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<FileText />}>O que pagar</Heading></div>
        <TextField label="Descrição" required maxLength={200} value={campos.descricao} onChange={(ev) => mudar({ descricao: ev.target.value })} placeholder="Ex.: Honorários contábeis · dez/2026" error={e("descricao")} />
        <div className="ui-dialog-grid">
          <CampoDeMenu label="Categoria (do OMIE)" required options={categorias} value={campos.categoriaId || undefined} icon={<Tag />}
            placeholder={campos.empresa ? "Selecione a categoria" : "Escolha a empresa primeiro"} disabled={!campos.empresa} error={e("categoriaId")} onChange={(v) => mudar({ categoriaId: v })} />
          <TextField label="Valor" required inputMode="decimal" prefix="R$" placeholder="0,00" value={campos.valor} disabled={editando}
            hint={editando ? "O valor muda por “Corrigir valor”, com motivo." : undefined}
            onChange={(ev) => mudar({ valor: valorEmDigitacao(ev.target.value) })} onBlur={() => { const d = decimalDigitado(campos.valor); if (d) mudar({ valor: displayCurrency(d) }); }} error={e("valor")} />
          <DatePicker label="Vencimento" required value={campos.vencimento} onChange={(v) => mudar({ vencimento: v })} disabled={travados}
            hint={dicaTravado ?? (editando ? undefined : campos.vencimento && campos.vencimento < hojeEmManaus() ? "Esta data já passou: a conta nasce vencida." : undefined)} error={e("vencimento")} />
          <CampoDeMenu label="Forma de pagamento" required options={formas} value={campos.forma || undefined} icon={<CreditCard />} placeholder="Selecione"
            disabled={travados} hint={dicaTravado} error={e("forma")} onChange={(v) => mudar({ forma: v as CamposDaContaAPagar["forma"] })} />
        </div>
        <CampoDeMenu label="Conta corrente (do OMIE)" required options={contas} value={campos.contaCorrenteId || undefined} icon={travados ? <Lock /> : <Landmark />}
          placeholder={campos.empresa ? "Selecione a conta" : "Escolha a empresa primeiro"} disabled={!campos.empresa || travados} hint={dicaTravado ?? "De onde sai o pagamento."} error={e("contaCorrenteId")}
          onChange={(v) => mudar({ contaCorrenteId: v })} />
        <TextareaField label="Observação" maxLength={2000} value={campos.observacao} onChange={(ev) => mudar({ observacao: ev.target.value })} placeholder="Ex.: pagar até o meio-dia; código de barras no anexo" error={e("observacao")} />
      </section>
    </form>
  </Dialog>;
}
