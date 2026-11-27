"use client";

import {
  formasDoLancamento,
  lancamentoCriadoNaConciliacaoSchema,
  transferenciaCriadaSchema,
  type ClientesDoFinanceiroResposta,
  type MovimentoDoExtrato,
  type OpcoesDoFinanceiro,
} from "@plugga/shared";
import { ArrowLeftRight, CalendarDays, CreditCard, Landmark, Plus, Search, Tag, Truck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { enviar, lerErro } from "../../lib/clientes";
import { categoriasDaEntrada, cobrancaExistente, competenciasParaEscolher, type Repetida } from "../../lib/cobranca-manual";
import { valorEmReais } from "../../lib/compras";
import {
  corpoDaCriacao,
  corpoDaTransferencia,
  efeitoDaCriacao,
  efeitoDaTransferencia,
  opcoesDeCriacao,
  valorDaLinhaParaDigitar,
  type CamposDaCriacao,
  type TipoDaCriacao,
} from "../../lib/conciliacao";
import { detalheDaConta } from "../../lib/configuracoes-do-financeiro";
import { hrefDosLancamentos } from "../../lib/financeiro";
import { categoriasDaSaida, ROTULO_DA_FORMA, valorEmDigitacao } from "../../lib/ficha-do-lancamento";
import estilosCompras from "../compras/compras.module.css";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, Radio, TextField } from "../ui";
import styles from "./financeiro-telas.module.css";

type Cliente = ClientesDoFinanceiroResposta["itens"][number];

const ROTULO_DO_TIPO: Record<TipoDaCriacao, { rotulo: string; descricao: (debito: boolean) => string }> = {
  receita: { rotulo: "Receita", descricao: () => "Um recebimento de cliente, já recebido." },
  despesa: { rotulo: "Despesa", descricao: () => "Uma conta paga, sem passar pela aprovação." },
  transferencia: { rotulo: "Transferência entre contas", descricao: (debito) => (debito ? "O dinheiro foi para outra conta da mesma empresa." : "O dinheiro veio de outra conta da mesma empresa.") },
};

/** As contas ativas da mesma empresa da linha, menos a dela: o outro lado de uma transferência. */
export function outrasContasDaLinha(opcoes: OpcoesDoFinanceiro, movimento: Pick<MovimentoDoExtrato, "contaCorrenteId">) {
  const daLinha = opcoes.contasCorrentes.find((c) => c.id === movimento.contaCorrenteId);
  return daLinha ? opcoes.contasCorrentes.filter((c) => c.ativa && c.empresa === daLinha.empresa && c.id !== daLinha.id) : [];
}

/**
 * "Criar lançamento" a partir de uma linha do extrato sem par (PLU-339, C5 e C6): a receita, a
 * despesa ou a transferência entre contas da mesma empresa, no dia e na conta da linha. Com o
 * valor da linha, já concilia; com outro, o botão vira "Criar sem conciliar" e diz o efeito.
 */
export function CriarDaLinha({ movimento, opcoes, gerente, aoFechar, aoCriar }: {
  movimento: MovimentoDoExtrato;
  opcoes: OpcoesDoFinanceiro;
  gerente: boolean;
  aoFechar: () => void;
  /** Depois de criar: a mensagem para a tela, que recarrega o painel. */
  aoCriar: (mensagem: string) => void;
}) {
  const debito = movimento.valor.trim().startsWith("-");
  const contaDaLinha = opcoes.contasCorrentes.find((c) => c.id === movimento.contaCorrenteId);
  const empresa = contaDaLinha?.empresa ?? null;
  const outras = outrasContasDaLinha(opcoes, movimento);
  const tipos = opcoesDeCriacao(movimento, gerente, outras.length);
  const [tipo, setTipo] = useState<TipoDaCriacao>(tipos[0] ?? "receita");
  const [campos, setCampos] = useState<CamposDaCriacao>(() => ({
    descricao: movimento.descricao.trim().slice(0, 200), valor: valorDaLinhaParaDigitar(movimento), clienteId: "", fornecedorId: "", categoriaId: "", competencia: movimento.dia.slice(0, 7), forma: "",
  }));
  const [descricaoDaTransferencia, setDescricaoDaTransferencia] = useState("");
  const [outraContaId, setOutraContaId] = useState(outras.length === 1 ? outras[0]!.id : "");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Cliente[] | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [repetida, setRepetida] = useState<Repetida | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (parcial: Partial<CamposDaCriacao>) => { setCampos((c) => ({ ...c, ...parcial })); setRepetida(null); };

  // Busca de clientes (2+ letras), como na Nova cobrança.
  useEffect(() => {
    if (tipo !== "receita" || cliente || busca.trim().length < 2) { setAchados(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<ClientesDoFinanceiroResposta>(`/api/financeiro/clientes?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setAchados(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, cliente, tipo]);

  const transferencia = tipo === "transferencia";
  const criacao = transferencia ? null : corpoDaCriacao(tipo, campos, movimento);
  // Enquanto o valor não é válido, o botão fala do caminho comum: criar e conciliar.
  const conciliar = criacao ? criacao.conciliar || criacao.porCampo.valor !== undefined : true;
  const outra = outras.find((c) => c.id === outraContaId);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null); setRepetida(null);
    if (transferencia) {
      const { corpo, porCampo } = corpoDaTransferencia({ outraContaId, descricao: descricaoDaTransferencia }, movimento);
      setErros(porCampo);
      if (!corpo) return;
      setEnviando(true);
      const r = await enviar<unknown>("/api/financeiro/conciliacao/transferencia", "POST", corpo);
      setEnviando(false);
      if (!r.ok) { setErros(r.erro.porCampo); setMensagem(r.erro.mensagem); return; }
      const lida = transferenciaCriadaSchema.safeParse(r.dados);
      aoCriar(lida.success
        ? `${lida.data.transferencia.codigo} criada: ${debito ? lida.data.saida.codigo : lida.data.entrada.codigo} conciliada com a linha, e ${debito ? lida.data.entrada.codigo : lida.data.saida.codigo} na ${outra?.nome ?? "outra conta"}, à espera do extrato dela.`
        : "Transferência criada.");
      return;
    }
    const { corpo, porCampo } = corpoDaCriacao(tipo, campos, movimento);
    setErros(porCampo);
    if (!corpo) return;
    setEnviando(true);
    try {
      const resposta = await fetch("/api/financeiro/conciliacao/lancamento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const dados: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        // A receita repetida (uma cobrança por cliente e competência): a existente resolve.
        const existente = resposta.status === 409 ? cobrancaExistente(dados) : null;
        if (existente) { setRepetida(existente); setMensagem(`Já existe a cobrança ${existente.codigo} deste cliente nesta competência. Se foi ela que entrou, corrija o valor ou concilie por ela.`); return; }
        const erro = lerErro(dados, "Não foi possível criar o lançamento. Tente de novo.");
        setErros(erro.porCampo); setMensagem(erro.mensagem);
        return;
      }
      const lido = lancamentoCriadoNaConciliacaoSchema.safeParse(dados);
      const codigo = lido.success ? lido.data.lancamento.codigo : "O lançamento";
      aoCriar(lido.success && lido.data.conciliado
        ? `${codigo} criado e conciliado.`
        : `${codigo} criado, ${tipo === "receita" ? "recebido" : "pago"} com outro valor; a linha do extrato continua sem par.`);
    } catch {
      setMensagem("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const categorias = tipo === "receita" ? categoriasDaEntrada(opcoes, empresa) : categoriasDaSaida(opcoes, empresa);
  const opcaoDaCategoria = categorias.map((c) => ({ value: c.id, label: c.nome, description: c.codigo, icon: <Tag /> }));
  const rotuloDoBotao = enviando ? "Criando…" : transferencia ? "Criar a transferência" : conciliar ? "Criar e conciliar" : "Criar sem conciliar";
  const dia = `${movimento.dia.slice(8, 10)}/${movimento.dia.slice(5, 7)}`;

  return <Dialog title="Criar lançamento" icon={<Plus size={20} />} onClose={aoFechar} cancelText="Voltar"
    description={`Da linha do extrato de ${dia}: ${movimento.descricao || (debito ? "débito" : "crédito")}, ${debito ? "−" : "+"} ${valorEmReais(movimento.valor.replace(/^-/, ""))}${contaDaLinha ? `, na ${contaDaLinha.nome}` : ""}.`}
    footer={<Button type="submit" form="form-criar-da-linha" variant={conciliar || transferencia ? "primary" : "secondary"} icon={transferencia ? <ArrowLeftRight size={16} /> : <Plus size={16} />} disabled={enviando}>{rotuloDoBotao}</Button>}>
    <form id="form-criar-da-linha" className="ui-dialog-form" onSubmit={(e) => void salvar(e)} noValidate>
      {mensagem ? <Alert tone="danger" title={`Erro: ${mensagem}`}>
        {repetida ? <Link href={hrefDosLancamentos({}, repetida.id)}>Abrir {repetida.codigo}</Link> : null}
      </Alert> : null}
      {tipos.length > 1 ? <fieldset className={styles.tipoDaCriacao}>
        <legend>O que é esta linha</legend>
        {tipos.map((t) => <Radio key={t} name="tipo-da-criacao" value={t} checked={tipo === t} label={ROTULO_DO_TIPO[t].rotulo} description={ROTULO_DO_TIPO[t].descricao(debito)}
          onChange={() => { setTipo(t); setErros({}); setMensagem(null); mudar({ categoriaId: "" }); }} />)}
      </fieldset> : null}

      {transferencia ? <>
        <CampoDeMenu label={debito ? "Para a conta" : "Da conta"} required value={outraContaId || undefined} onChange={setOutraContaId} icon={<Landmark />} placeholder="Selecione a conta" error={erros.outraContaId}
          hint="Só contas ativas da mesma empresa." options={outras.map((c) => ({ value: c.id, label: c.nome, ...(detalheDaConta(c) ? { description: detalheDaConta(c) } : {}), icon: <Landmark /> }))} />
        {outra && contaDaLinha ? <Alert tone="info" title="As duas pontas">{efeitoDaTransferencia(movimento, contaDaLinha.nome, outra.nome)}</Alert> : null}
      </> : <>
        {tipo === "receita" ? <div className="ui-field">
          <label htmlFor="criar-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
          {cliente ? <div className={estilosCompras.escolhido}><span>{cliente.nome}</span><Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${cliente.nome}`} onClick={() => { setCliente(null); mudar({ clienteId: "" }); }} /></div> : <>
            <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
              <input id="criar-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off"
                aria-invalid={erros.clienteId ? true : undefined} aria-describedby={erros.clienteId ? "criar-cliente-erro" : "criar-cliente-dica"} /></div>
            {achados ? (achados.length ? <ul className={estilosCompras.resultados} aria-label="Clientes encontrados">{achados.map((c) => <li key={c.id}><button type="button" onClick={() => { setCliente(c); setBusca(""); mudar({ clienteId: c.id }); setErros((e) => ({ ...e, clienteId: "" })); }}>{c.nome}</button></li>)}</ul>
              : <p className="ui-field-hint" role="status">Nenhum cliente com esse nome.</p>) : <p id="criar-cliente-dica" className="ui-field-hint">Busca nos clientes do CRM.</p>}
          </>}
          {erros.clienteId ? <p id="criar-cliente-erro" className="ui-field-error">Erro: {erros.clienteId}</p> : null}
        </div> : <CampoDeMenu label="Fornecedor" required value={campos.fornecedorId || undefined} onChange={(v) => { mudar({ fornecedorId: v }); setErros((e) => ({ ...e, fornecedorId: "" })); }} icon={<Truck />} placeholder="Selecione o fornecedor" error={erros.fornecedorId || undefined}
          options={opcoes.fornecedores.map((f) => ({ value: f.id, label: f.nome, icon: <Truck /> }))} />}

        <div className="ui-dialog-grid">
          <CampoDeMenu label={tipo === "receita" ? "Categoria" : "Categoria (opcional)"} required={tipo === "receita"} value={campos.categoriaId || undefined} onChange={(v) => { mudar({ categoriaId: v }); setErros((e) => ({ ...e, categoriaId: "" })); }} icon={<Tag />}
            placeholder="Selecione a categoria" error={erros.categoriaId || undefined} hint={tipo === "despesa" ? "Pode ficar para classificar depois." : undefined} options={opcaoDaCategoria} />
          {tipo === "receita"
            ? <CampoDeMenu label="Competência" value={campos.competencia || undefined} onChange={(v) => mudar({ competencia: v })} icon={<CalendarDays />} hint="Padrão: o mês do crédito."
                options={competenciasParaEscolher(movimento.dia).map((m) => ({ ...m, icon: <CalendarDays /> }))} />
            : <CampoDeMenu label="Forma (opcional)" value={campos.forma || undefined} onChange={(v) => mudar({ forma: v as CamposDaCriacao["forma"] })} icon={<CreditCard />}
                options={formasDoLancamento.map((f) => ({ value: f, label: ROTULO_DA_FORMA[f], icon: <CreditCard /> }))} />}
        </div>
        <TextField label="Valor" required inputMode="decimal" prefix="R$" value={campos.valor} onChange={(e) => mudar({ valor: valorEmDigitacao(e.target.value) })} error={erros.valor || undefined}
          hint={`O valor da linha é ${valorEmReais(movimento.valor.replace(/^-/, ""))}.`} />
      </>}
      {transferencia
        ? <TextField label="Descrição (opcional)" maxLength={200} value={descricaoDaTransferencia} onChange={(e) => setDescricaoDaTransferencia(e.target.value)} error={erros.descricao || undefined}
            placeholder={outra && contaDaLinha ? `Transferência de ${debito ? contaDaLinha.nome : outra.nome} para ${debito ? outra.nome : contaDaLinha.nome}` : "Transferência entre contas"} />
        : <TextField label="Descrição" required maxLength={200} value={campos.descricao} onChange={(e) => mudar({ descricao: e.target.value })} error={erros.descricao || undefined} />}
      {transferencia ? null : <Alert tone={conciliar ? "info" : "warning"} title={conciliar ? "Criar e conciliar" : "Criar sem conciliar"}>{efeitoDaCriacao(tipo === "receita" ? "receita" : "despesa", conciliar, movimento.valor)}</Alert>}
    </form>
  </Dialog>;
}
