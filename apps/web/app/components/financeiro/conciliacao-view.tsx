"use client";

import {
  conciliarSchema,
  criarTarifaSchema,
  criarTarifasSchema,
  desfazerConciliacaoSchema,
  escopoDaConciliacaoSchema,
  extratoImportadoSchema,
  marcarNaConciliacaoSchema,
  sugestaoDaTarifaSchema,
  type CompanyKey,
  type ContaCorrente,
  type ExtratoImportado,
  type LancamentoNaConciliacao,
  type MovimentoDoExtrato,
  type OpcoesDoFinanceiro,
  type PainelDaConciliacao,
} from "@plugga/shared";
import { Building2, CalendarDays, Cloud, Landmark, Link2, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { lerErro } from "../../lib/clientes";
import { hojeEmManaus, ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import { hrefDaConciliacao, periodoAceito, type FiltrosDaConciliacao } from "../../lib/conciliacao";
import { contasDaTela, detalheDaConta } from "../../lib/configuracoes-do-financeiro";
import { hrefDosLancamentos } from "../../lib/financeiro";
import { horarioEmManaus } from "../../lib/ordens-de-servico";
import { validarCorpo, type EsquemaDeCorpo } from "../../lib/requisicao";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, FileDropzone, SelectField, TextareaField } from "../ui";
import { EngrenagemDoFinanceiro } from "./engrenagem-do-financeiro";
import styles from "./financeiro-telas.module.css";

const NOMES_DO_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"] as const;

async function enviarJson(url: string, schema: EsquemaDeCorpo<unknown>, corpo: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const validado = validarCorpo(schema, corpo);
  if (!validado.ok) return validado;
  try {
    const resposta = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validado.dados) });
    const payload: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, message: lerErro(payload, "Não foi possível concluir. Tente de novo.").mensagem };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, message: "Sem conexão com o servidor. Tente de novo." };
  }
}

function escopoDe(f: FiltrosDaConciliacao) {
  return { de: f.de, ate: f.ate, ...(f.empresa ? { empresa: f.empresa } : {}), ...(f.conta ? { contaCorrenteId: f.conta } : {}) };
}

function chaveDoMes(iso: string): string {
  return iso.slice(0, 7);
}

function rotuloDoMes(chave: string, frase = false): string {
  const [ano, mes] = chave.split("-").map(Number) as [number, number];
  const nome = NOMES_DO_MES[mes - 1] ?? chave;
  const texto = `${nome} de ${ano}`;
  return frase ? texto.toLocaleLowerCase("pt-BR") : texto;
}

function fimDoMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number) as [number, number];
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${chave}-${String(dia).padStart(2, "0")}`;
}

function mesesRecentes(de: string): { value: string; label: string }[] {
  const [ano, mes] = chaveDoMes(de).split("-").map(Number) as [number, number];
  return Array.from({ length: 8 }, (_, i) => {
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    const chave = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
    return { value: chave, label: rotuloDoMes(chave) };
  });
}

function diaBarra(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function valorComSinal(valor: string, positivo: boolean): string {
  const texto = valorEmReais(valor.replace(/^-/, "")) ?? "—";
  return positivo ? `+ ${texto}` : `− ${texto}`;
}

function rotuloDaConta(conta: Pick<ContaCorrente, "nome" | "empresa">): string {
  const curta = conta.empresa === "waze" ? "Waze" : "Plugga";
  const nome = conta.nome.trim();
  return nome.toLocaleLowerCase("pt-BR").includes(curta.toLocaleLowerCase("pt-BR")) ? nome : `${nome} · ${curta}`;
}

function notaDoPar(diaDoExtrato: string, diaDoLancamento: string): string {
  if (diaDoExtrato === diaDoLancamento) return "mesmo valor · mesmo dia";
  const dias = Math.round(Math.abs(Date.parse(diaDoExtrato) - Date.parse(diaDoLancamento)) / 86_400_000);
  return `mesmo valor · a ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

function quandoFoiLido(extratos: ExtratoImportado[], hoje: string): string {
  const recente = [...extratos].sort((a, b) => b.importadoEm.localeCompare(a.importadoEm))[0];
  if (!recente) return "Nenhum extrato neste período";
  const dia = hojeEmManaus(new Date(recente.importadoEm));
  const hora = horarioEmManaus(recente.importadoEm);
  return dia === hoje ? `Extrato lido hoje, ${hora}` : `Extrato lido em ${diaBarra(dia)}, ${hora}`;
}

/** Conciliação do extrato com os lançamentos pagos e recebidos (PLU-339). */
export function ConciliacaoView({ filtros, painel, opcoes, gerente }: {
  filtros: FiltrosDaConciliacao;
  painel: PainelDaConciliacao;
  opcoes: OpcoesDoFinanceiro | null;
  gerente: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [verConciliados, setVerConciliados] = useState(filtros.aba === "conciliados");
  const [loteTarifas, setLoteTarifas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [lote, setLote] = useState(false);
  const [desfazerId, setDesfazerId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tarifaId, setTarifaId] = useState<string | null>(null);
  const [pares, setPares] = useState<Record<string, string>>({});

  const contas = opcoes ? contasDaTela(opcoes, filtros.empresa ?? null).filter((conta) => conta.ativa) : [];
  const porId = useMemo(() => {
    const mapa = new Map<string, LancamentoNaConciliacao>();
    for (const lancamento of [
      ...painel.semExtrato,
      ...(painel.lancamentosCandidatos ?? []),
      ...painel.sugeridos.map((par) => par.lancamento),
      ...painel.valorDiferente.map((par) => par.lancamento),
      ...painel.conciliados.map((par) => par.lancamento),
    ]) mapa.set(lancamento.id, lancamento);
    return mapa;
  }, [painel]);

  const ir = (proximo: FiltrosDaConciliacao) => router.push(hrefDaConciliacao(proximo));
  const mudarEmpresa = (valor: string) => {
    const empresa = valor === "todas" ? undefined : valor as CompanyKey;
    const conta = contas.find((item) => item.id === filtros.conta);
    ir({ de: filtros.de, ate: filtros.ate, aba: filtros.aba, ...(empresa ? { empresa } : {}), ...(conta && (!empresa || conta.empresa === empresa) ? { conta: conta.id } : {}) });
  };

  async function agir(url: string, schema: EsquemaDeCorpo<unknown>, corpo: unknown, mensagem: string) {
    setOcupado(true);
    setErro(null);
    const resultado = await enviarJson(url, schema, corpo);
    setOcupado(false);
    if (!resultado.ok) { setErro(resultado.message); return null; }
    setAviso(mensagem);
    router.refresh();
    return resultado.data;
  }

  const hoje = hojeEmManaus();
  const mes = chaveDoMes(filtros.de);
  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const opcoesDeConta = [{ value: "todas", label: "Todas as contas", icon: <Landmark /> }, ...contas.map((conta) => ({ value: conta.id, label: rotuloDaConta(conta), description: detalheDaConta(conta) || ROTULO_DA_EMPRESA[conta.empresa], icon: <PontoDaEmpresa empresa={conta.empresa} /> }))];
  const opcoesDeMes = mesesRecentes(filtros.de).map((item) => ({ ...item, icon: <CalendarDays /> }));
  const contaAtual = contas.find((conta) => conta.id === filtros.conta);
  const tarifas = painel.semLancamento.filter((movimento) => movimento.pareceTarifa);
  const total = painel.resumo.movimentos;
  const progresso = total ? Math.round((painel.resumo.conciliados / total) * 100) : 0;
  const contexto = `${contaAtual ? rotuloDaConta(contaAtual) : "Todas as contas"} · ${rotuloDoMes(mes, true)}`;

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Conciliação</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Extrato do banco × lançamentos do Plugga OS.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <div className={styles.filtroEmpresa}>
          <FiltroComBusca label="Conta" icon={<Landmark />} semFiltro="todas" value={filtros.conta ?? "todas"} onChange={(valor) => ir({ ...filtros, ...(valor === "todas" ? { conta: undefined } : { conta: valor }) })} options={opcoesDeConta} />
        </div>
        <div className={styles.filtroEmpresa}>
          <FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={mudarEmpresa} options={empresas} />
        </div>
        <div className={styles.filtroEmpresa}>
          <FiltroComBusca label="Mês" icon={<CalendarDays />} value={mes} onChange={(valor) => ir({ ...filtros, de: `${valor}-01`, ate: fimDoMes(valor) })} options={opcoesDeMes} />
        </div>
        {opcoes ? <EngrenagemDoFinanceiro opcoes={opcoes} /> : null}
      </div>
    </header>

    <div className={styles.pilha}>
    {erro ? <Alert tone="danger" title="Não deu para concluir">{erro}</Alert> : null}
    {aviso ? <Alert tone="success" title="Feito">{aviso}</Alert> : null}

    <section className={styles.faixa} aria-label="Progresso da conciliação">
      <div>
        <p>{contexto}</p>
        <h2>{painel.resumo.conciliados} de {total} conciliados</h2>
        <span className={styles.faixaBarra} aria-hidden="true"><span style={{ inlineSize: `${progresso}%` }} /></span>
      </div>
      <div className={styles.faixaLado}>
        <span className={styles.stat}><small>Sugeridos</small><strong>{painel.resumo.sugeridos}</strong></span>
        <span className={styles.stat}><small>Sem par</small><strong>{painel.resumo.semLancamento}</strong></span>
        <span className={styles.stat}><small>Falta conciliar</small><strong>{valorEmReais(painel.resumo.faltaConciliar)}</strong></span>
        <span className={styles.lido}><Cloud size={14} aria-hidden="true" />{quandoFoiLido(painel.extratos, hoje)}</span>
        <Button variant="secondary" icon={<Cloud size={16} />} onClick={() => setImportando(true)} disabled={!opcoes || contas.length === 0}>Ler extrato</Button>
        {painel.resumo.sugeridos > 0 ? <Button icon={<Link2 size={16} />} onClick={() => setLote(true)} disabled={ocupado}>Conciliar os {painel.resumo.sugeridos} sugeridos</Button> : null}
      </div>
    </section>

    <Secao titulo="Sugeridos" total={painel.sugeridos.length} sub="O valor e a data batem. Confirma e concilia." vazio={painel.sugeridos.length === 0} vazioTexto="Nenhum par com o mesmo valor neste período.">
      <Grade>
        {painel.sugeridos.map((par) => <li key={par.movimento.id} className={styles.sugestao}>
          <CartaoDoExtrato movimento={par.movimento} />
          <div className={styles.miolo}>
            <Button size="sm" icon={<Link2 size={14} />} disabled={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/conciliar", conciliarSchema, { movimentoId: par.movimento.id, lancamentoId: par.lancamento.id }, `${par.lancamento.codigo} conciliado.`)}>Conciliar</Button>
            <small>{notaDoPar(par.movimento.dia, par.lancamento.liquidadoEm)}</small>
          </div>
          <CartaoDoLancamento lancamento={par.lancamento} />
        </li>)}
      </Grade>
    </Secao>

    {painel.valorDiferente.length ? <Secao titulo="Valor diferente" total={painel.valorDiferente.length} sub="O par só concilia quando o valor é o mesmo." vazio={false} vazioTexto="">
      <Grade>
        {painel.valorDiferente.map((par) => <li key={par.movimento.id} className={styles.sugestao}>
          <CartaoDoExtrato movimento={par.movimento} />
          <div className={styles.miolo}><small>Diferença {valorEmReais(par.diferenca)}</small></div>
          <CartaoDoLancamento lancamento={par.lancamento} />
        </li>)}
      </Grade>
    </Secao> : null}

    <Secao titulo="No extrato, sem lançamento" total={painel.semLancamento.length} sub="Crie o lançamento a partir da linha do extrato, ou marque como pendente para ver depois." vazio={painel.semLancamento.length === 0} vazioTexto="Toda linha do extrato tem par ou já foi conciliada."
      acao={tarifas.length ? <Button variant="secondary" icon={<Plus size={16} />} disabled={ocupado} onClick={() => setLoteTarifas(true)}>{tarifas.length === 1 ? "Criar a tarifa" : `Criar as ${tarifas.length} tarifas`}</Button> : null}>
      <Grade>
        {painel.semLancamento.map((movimento) => {
          const candidatos = (movimento.candidatos ?? []).flatMap((id) => { const lancamento = porId.get(id); return lancamento ? [lancamento] : []; });
          const escolhido = pares[movimento.id] ?? candidatos[0]?.id;
          const lancamento = candidatos.find((item) => item.id === escolhido);
          return <li key={movimento.id} className={styles.sugestao}>
            <CartaoDoExtrato movimento={movimento} />
            <div className={styles.miolo}>
              <div className={styles.mioloAcoes}>
                {lancamento ? <Button size="sm" icon={<Link2 size={14} />} disabled={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/conciliar", conciliarSchema, { movimentoId: movimento.id, lancamentoId: lancamento.id }, "Linha conciliada.")}>Conciliar</Button> : null}
                {movimento.pareceTarifa ? <Button size="sm" icon={<Plus size={14} />} disabled={ocupado} onClick={() => setTarifaId(movimento.id)}>Criar tarifa</Button> : null}
                <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/marcar", marcarNaConciliacaoSchema, { movimentoId: movimento.id, marcado: movimento.estado !== "marcado" }, movimento.estado === "marcado" ? "Linha retomada." : "Linha marcada como pendente.")}>{movimento.estado === "marcado" ? "Retomar" : "Marcar pendente"}</Button>
              </div>
              {candidatos.length > 1 ? <SelectField label="Lançamento" value={escolhido} onChange={(valor) => setPares((atual) => ({ ...atual, [movimento.id]: valor }))} options={candidatos.map((item) => ({ value: item.id, label: `${item.codigo} · ${item.favorecido}` }))} /> : null}
              {movimento.estado === "marcado" ? <small>Marcado como pendente.</small> : null}
            </div>
            {lancamento ? <CartaoDoLancamento lancamento={lancamento} /> : <p className={styles.vazioDireita}>{movimento.pareceTarifa ? "Tarifa bancária, sem lançamento." : "Nenhum lançamento com o mesmo valor."}</p>}
          </li>;
        })}
      </Grade>
    </Secao>

    {painel.semExtrato.length ? <Secao titulo="Pago ou recebido, sem extrato" total={painel.semExtrato.length} sub="O dinheiro saiu ou entrou no Plugga OS e ainda não apareceu no extrato." vazio={false} vazioTexto="">
      <ul className={styles.grade}>{painel.semExtrato.map((lancamento) => <li key={lancamento.id} className={styles.sugestao}>
        <p className={styles.vazioDireita}>{lancamento.marcado ? "Marcado como pendente." : "Ainda não apareceu no extrato."}</p>
        <div className={styles.miolo}>
          <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/marcar", marcarNaConciliacaoSchema, { lancamentoId: lancamento.id, marcado: !lancamento.marcado }, lancamento.marcado ? "Lançamento retomado." : "Lançamento marcado como pendente.")}>{lancamento.marcado ? "Retomar" : "Marcar pendente"}</Button>
        </div>
        <CartaoDoLancamento lancamento={lancamento} />
      </li>)}</ul>
    </Secao> : null}

    {painel.conciliados.length ? <Secao titulo="Conciliados" total={painel.conciliados.length} sub="Pares já conferidos neste período." vazio={false} vazioTexto=""
      acao={<Button variant="secondary" onClick={() => setVerConciliados((valor) => !valor)}>{verConciliados ? "Ocultar" : `Ver os ${painel.conciliados.length}`}</Button>}>
      {verConciliados ? <Grade>
        {painel.conciliados.map((par) => <li key={par.movimento.id} className={styles.sugestao}>
          <CartaoDoExtrato movimento={par.movimento} />
          <div className={styles.miolo}>
            <small>{par.conciliadoPor ? `Conciliado por ${par.conciliadoPor.nome}` : "Conciliado"}</small>
            {gerente ? <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => { setMotivo(""); setDesfazerId(par.movimento.id); }}>Desfazer</Button> : null}
          </div>
          <CartaoDoLancamento lancamento={par.lancamento} />
        </li>)}
      </Grade> : null}
    </Secao> : null}
    </div>

    {importando && opcoes ? <ImportarExtrato contas={contas} contaInicial={filtros.conta} ocupado={ocupado} aoFechar={() => setImportando(false)} aoImportar={async (contaId, arquivo) => {
      setOcupado(true);
      setErro(null);
      const formulario = new FormData();
      formulario.set("arquivo", arquivo);
      try {
        const resposta = await fetch(`/api/financeiro/contas-correntes/${contaId}/extratos`, { method: "POST", body: formulario });
        const payload: unknown = await resposta.json().catch(() => null);
        if (!resposta.ok) { setErro(lerErro(payload, "Não foi possível importar o extrato.").mensagem); setOcupado(false); return; }
        const lido = extratoImportadoSchema.safeParse(payload);
        setOcupado(false);
        setImportando(false);
        if (!lido.success) { setAviso("Extrato importado."); router.refresh(); return; }
        const extrato: ExtratoImportado = lido.data;
        setAviso(`${extrato.novos} ${extrato.novos === 1 ? "movimento novo" : "movimentos novos"} e ${extrato.repetidos} ${extrato.repetidos === 1 ? "repetido" : "repetidos"}.${extrato.contaConferida === false ? " Não deu para conferir se o arquivo é desta conta." : ""}`);
        const proximo = periodoAceito(extrato.periodo.de, extrato.periodo.ate) ? { de: extrato.periodo.de, ate: extrato.periodo.ate } : { de: filtros.de, ate: filtros.ate };
        ir({ ...filtros, ...proximo, conta: extrato.contaCorrenteId, aba: "sugeridos" });
        router.refresh();
      } catch {
        setOcupado(false);
        setErro("Sem conexão com o servidor. Tente de novo.");
      }
    }} /> : null}

    {lote ? <Dialog title="Conciliar os sugeridos" description="Entram só os pares com o mesmo valor, nesta conta e neste período." onClose={() => setLote(false)} footer={<Button loading={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/conciliar-sugeridos", escopoDaConciliacaoSchema, escopoDe(filtros), "Sugeridos conciliados.").then((dados) => {
      if (!dados || typeof dados !== "object" || !("conciliados" in dados)) return;
      setAviso(`${String((dados as { conciliados: number }).conciliados)} pares conciliados.`);
      setLote(false);
    })}>Conciliar</Button>}>
      <p>Valor diferente fica de fora: o par só concilia com o mesmo valor.</p>
    </Dialog> : null}

    {loteTarifas ? <TarifasEmLote ids={tarifas.map((movimento) => movimento.id)} opcoes={opcoes} ocupado={ocupado} aoFechar={() => setLoteTarifas(false)} aoCriar={(corpo) => void agir("/api/financeiro/conciliacao/tarifas", criarTarifasSchema, corpo, "Tarifas criadas.").then((dados) => {
      if (!dados || typeof dados !== "object" || !("criadas" in dados)) return;
      const criadas = Number((dados as { criadas: number }).criadas);
      setAviso(`${criadas} ${criadas === 1 ? "tarifa criada e conciliada" : "tarifas criadas e conciliadas"}.`);
      setLoteTarifas(false);
    })} /> : null}

    {desfazerId ? <Dialog title="Desfazer conciliação" description="A linha do extrato e o lançamento voltam a ficar sem par." variant="danger" onClose={() => setDesfazerId(null)} footer={<Button variant="danger" loading={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/desfazer", desfazerConciliacaoSchema, { movimentoId: desfazerId, motivo }, "Conciliação desfeita.").then((dados) => { if (dados) setDesfazerId(null); })}>Desfazer</Button>}>
      <TextareaField label="Motivo" required value={motivo} onChange={(evento) => setMotivo(evento.target.value)} hint="Pelo menos 3 letras." />
    </Dialog> : null}

    {tarifaId ? <TarifaDialog movimentoId={tarifaId} opcoes={opcoes} ocupado={ocupado} aoFechar={() => setTarifaId(null)} aoCriar={(corpo) => void agir("/api/financeiro/conciliacao/tarifa", criarTarifaSchema, corpo, "Tarifa criada e conciliada.").then((dados) => { if (dados) setTarifaId(null); })} /> : null}
  </div>;
}

function Secao({ titulo, total, sub, vazio, vazioTexto, acao, children }: { titulo: string; total: number; sub: string; vazio: boolean; vazioTexto: string; acao?: ReactNode; children: ReactNode }) {
  return <section className={styles.bloco} aria-label={titulo}>
    <header className={styles.blocoTopo}>
      <div><h2>{titulo}<span className={styles.contagem}>{String(total).padStart(2, "0")}</span></h2><p>{vazio ? vazioTexto : sub}</p></div>
      {acao}
    </header>
    {vazio ? null : children}
  </section>;
}

function Grade({ children }: { children: ReactNode }) {
  return <div className={styles.grade}>
    <div className={styles.gradeCabeca} aria-hidden="true"><span><Landmark size={14} />Extrato do banco</span><span /><span><Receipt size={14} />Lançamentos do Plugga OS</span></div>
    <ul className={styles.grade}>{children}</ul>
  </div>;
}

function CartaoDoExtrato({ movimento }: { movimento: MovimentoDoExtrato }) {
  const credito = !movimento.valor.startsWith("-");
  return <article className={styles.cartaoPar}>
    <small>{diaBarra(movimento.dia)}</small>
    <strong>{movimento.descricao || (credito ? "Crédito" : "Débito")}</strong>
    <b>{valorComSinal(movimento.valor, credito)}</b>
  </article>;
}

function CartaoDoLancamento({ lancamento }: { lancamento: LancamentoNaConciliacao }) {
  return <article className={styles.cartaoPar}>
    <small>{diaBarra(lancamento.liquidadoEm)} · <Link href={hrefDosLancamentos({}, lancamento.id)}>{lancamento.codigo}</Link> · <EmpresaComPonto empresa={lancamento.empresa} curto /></small>
    <strong>{lancamento.descricao || lancamento.favorecido}</strong>
    <b>{valorComSinal(lancamento.valor, lancamento.tipo === "entrada")}</b>
  </article>;
}

function TarifasEmLote({ ids, opcoes, ocupado, aoFechar, aoCriar }: {
  ids: string[];
  opcoes: OpcoesDoFinanceiro | null;
  ocupado: boolean;
  aoFechar: () => void;
  aoCriar: (corpo: { movimentoIds: string[]; fornecedorId?: string; categoriaId?: string }) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [categoriaFixa, setCategoriaFixa] = useState<string | null>(null);
  const [empresaDaConta, setEmpresaDaConta] = useState<CompanyKey | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const primeiro = ids[0];

  useEffect(() => {
    if (!primeiro) return;
    let ativo = true;
    void fetch(`/api/financeiro/conciliacao/movimentos/${primeiro}/tarifa`).then(async (resposta) => {
      const payload: unknown = await resposta.json().catch(() => null);
      if (!ativo) return;
      if (!resposta.ok) { setFalha(lerErro(payload, "Não foi possível preparar as tarifas.").mensagem); return; }
      const lido = sugestaoDaTarifaSchema.safeParse(payload);
      if (!lido.success) { setFalha("A sugestão da tarifa veio incompleta."); return; }
      const conta = opcoes?.contasCorrentes.find((item) => item.id === lido.data.movimento.contaCorrenteId);
      if (conta) setEmpresaDaConta(conta.empresa);
      if (lido.data.fornecedor) setFornecedorId(lido.data.fornecedor.id);
      if (lido.data.categoria) setCategoriaFixa(`${lido.data.categoria.codigo} · ${lido.data.categoria.nome}`);
    }).catch(() => { if (ativo) setFalha("Sem conexão com o servidor. Tente de novo."); });
    return () => { ativo = false; };
  }, [primeiro, opcoes]);

  const fornecedores = opcoes?.fornecedores.map((item) => ({ value: item.id, label: item.nome })) ?? [];
  const categorias = opcoes?.categorias.filter((item) => item.ativa && item.tipo === "despesa" && (!empresaDaConta || item.empresa === empresaDaConta)).map((item) => ({ value: item.id, label: `${item.codigo} · ${item.nome}` })) ?? [];
  const n = ids.length;

  return <Dialog title={n === 1 ? "Criar a tarifa" : `Criar as ${n} tarifas`} description="Cada tarifa nasce paga, no dia e no valor da linha, e fica conciliada." onClose={aoFechar} footer={
    <Button loading={ocupado} disabled={!fornecedorId || (!categoriaFixa && !categoriaId)} onClick={() => aoCriar({ movimentoIds: ids, fornecedorId, ...(!categoriaFixa && categoriaId ? { categoriaId } : {}) })}>Criar e conciliar</Button>
  }>
    {falha ? <Alert tone="danger" title="Não deu para preparar">{falha}</Alert> : null}
    {categoriaFixa ? <p>Categoria de tarifas: {categoriaFixa}.</p> : <SelectField label="Categoria de despesa" required value={categoriaId} onChange={setCategoriaId} options={categorias} />}
    <SelectField label="Fornecedor" required value={fornecedorId} onChange={setFornecedorId} options={fornecedores} />
  </Dialog>;
}

function ImportarExtrato({ contas, contaInicial, ocupado, aoFechar, aoImportar }: {
  contas: OpcoesDoFinanceiro["contasCorrentes"];
  contaInicial?: string;
  ocupado: boolean;
  aoFechar: () => void;
  aoImportar: (contaId: string, arquivo: File) => Promise<void>;
}) {
  const [contaId, setContaId] = useState(contaInicial && contas.some((conta) => conta.id === contaInicial) ? contaInicial : contas[0]?.id ?? "");
  const [arquivo, setArquivo] = useState<File[]>([]);
  return <Dialog title="Importar extrato OFX" description="O arquivo fica no Plugga OS. Movimento repetido não entra de novo." onClose={aoFechar} footer={
    <Button loading={ocupado} disabled={!contaId || !arquivo[0]} onClick={() => { const escolhido = arquivo[0]; if (escolhido) void aoImportar(contaId, escolhido); }}>Importar</Button>
  }>
    <SelectField label="Conta" required value={contaId} onChange={setContaId} options={contas.map((conta) => ({ value: conta.id, label: `${conta.nome} · ${ROTULO_DA_EMPRESA[conta.empresa]}` }))} />
    <FileDropzone label="Arquivo OFX, até 5 MB" value={arquivo} onChange={(itens) => setArquivo(itens.slice(-1))} disabled={ocupado} />
  </Dialog>;
}

function TarifaDialog({ movimentoId, opcoes, ocupado, aoFechar, aoCriar }: {
  movimentoId: string;
  opcoes: OpcoesDoFinanceiro | null;
  ocupado: boolean;
  aoFechar: () => void;
  aoCriar: (corpo: { movimentoId: string; fornecedorId: string; categoriaId?: string }) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [categoriaFixa, setCategoriaFixa] = useState<string | null>(null);
  const [empresaDaConta, setEmpresaDaConta] = useState<CompanyKey | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let ativo = true;
    void fetch(`/api/financeiro/conciliacao/movimentos/${movimentoId}/tarifa`).then(async (resposta) => {
      const payload: unknown = await resposta.json().catch(() => null);
      if (!ativo) return;
      if (!resposta.ok) { setFalha(lerErro(payload, "Não foi possível preparar a tarifa.").mensagem); return; }
      const lido = sugestaoDaTarifaSchema.safeParse(payload);
      if (!lido.success) { setFalha("A sugestão da tarifa veio incompleta."); return; }
      const conta = opcoes?.contasCorrentes.find((item) => item.id === lido.data.movimento.contaCorrenteId);
      if (conta) setEmpresaDaConta(conta.empresa);
      if (lido.data.fornecedor) setFornecedorId(lido.data.fornecedor.id);
      if (lido.data.categoria) setCategoriaFixa(`${lido.data.categoria.codigo} · ${lido.data.categoria.nome}`);
      setPronto(true);
    }).catch(() => { if (ativo) setFalha("Sem conexão com o servidor. Tente de novo."); });
    return () => { ativo = false; };
  }, [movimentoId, opcoes]);

  const fornecedores = opcoes?.fornecedores.map((item) => ({ value: item.id, label: item.nome })) ?? [];
  const categorias = opcoes?.categorias.filter((item) => item.ativa && item.tipo === "despesa" && (!empresaDaConta || item.empresa === empresaDaConta)).map((item) => ({ value: item.id, label: `${item.codigo} · ${item.nome}` })) ?? [];

  return <Dialog title="Criar tarifa" description="A tarifa nasce paga, no dia e no valor da linha, e fica conciliada." onClose={aoFechar} footer={
    <Button loading={ocupado} disabled={!pronto || !fornecedorId || (!categoriaFixa && !categoriaId)} onClick={() => aoCriar({ movimentoId, fornecedorId, ...(!categoriaFixa && categoriaId ? { categoriaId } : {}) })}>Criar e conciliar</Button>
  }>
    {falha ? <Alert tone="danger" title="Não deu para preparar">{falha}</Alert> : null}
    {categoriaFixa ? <p>Categoria de tarifas: {categoriaFixa}.</p> : <SelectField label="Categoria de despesa" required value={categoriaId} onChange={setCategoriaId} options={categorias} />}
    <SelectField label="Fornecedor" required value={fornecedorId} onChange={setFornecedorId} options={fornecedores} />
  </Dialog>;
}
