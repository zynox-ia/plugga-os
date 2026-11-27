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
import { Building2, CalendarDays, Cloud, Landmark, Link2, Pencil, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { enviar, lerErro } from "../../lib/clientes";
import { hojeEmManaus, ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import { correcaoDoPar, escopoDoSaldo, hrefDaConciliacao, motivoSemCriacao, notaDosSaldos, opcoesDeCriacao, periodoAceito, problemaDoMotivo, saldosDaConciliacao, semParDoResumo, type AcessoAosLancamentos, type EscopoDoSaldo, type FiltrosDaConciliacao } from "../../lib/conciliacao";
import { contasDaTela, detalheDaConta } from "../../lib/configuracoes-do-financeiro";
import { hrefDosLancamentos } from "../../lib/financeiro";
import { corpoDaCorrecao, valorEmDigitacao } from "../../lib/ficha-do-lancamento";
import { horarioEmManaus } from "../../lib/ordens-de-servico";
import { validarCorpo, type EsquemaDeCorpo } from "../../lib/requisicao";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, FileDropzone, SelectField, TextField, TextareaField } from "../ui";
import { CriarDaLinha, outrasContasDaLinha } from "./criar-da-linha";
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
export function ConciliacaoView({ filtros, painel, opcoes, gerente, buscaCliente, acessoAosLancamentos }: {
  filtros: FiltrosDaConciliacao;
  painel: PainelDaConciliacao;
  opcoes: OpcoesDoFinanceiro | null;
  gerente: boolean;
  /** Contas a receber: a busca de cliente que a receita guiada pede. */
  buscaCliente: boolean;
  /** Lançamentos e os tipos que a pessoa abre (o link para o lançamento existente). */
  acessoAosLancamentos: AcessoAosLancamentos;
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
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null);
  const [tarifaId, setTarifaId] = useState<string | null>(null);
  const [pares, setPares] = useState<Record<string, string>>({});
  const [corrigirId, setCorrigirId] = useState<string | null>(null);
  const [criarId, setCriarId] = useState<string | null>(null);

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
  const escopoDoSaldoAtual = escopoDoSaldo(opcoes?.contasCorrentes ?? [], filtros);
  // A conta do filtro, mesmo inativa ou de outra empresa: o painel segue filtrado por ela, então o seletor a mostra.
  const contaAtual = escopoDoSaldoAtual.conta;
  const contaForaDaLista = contaAtual && !contas.some((conta) => conta.id === contaAtual.id) ? contaAtual : null;
  const opcoesDeConta = [{ value: "todas", label: "Todas as contas", icon: <Landmark /> }, ...[...contas, ...(contaForaDaLista ? [contaForaDaLista] : [])].map((conta) => ({
    value: conta.id, label: rotuloDaConta(conta), icon: <PontoDaEmpresa empresa={conta.empresa} />,
    description: conta === contaForaDaLista ? (conta.ativa ? "de outra empresa" : "inativa") : detalheDaConta(conta) || ROTULO_DA_EMPRESA[conta.empresa],
  }))];
  const opcoesDeMes = mesesRecentes(filtros.de).map((item) => ({ ...item, icon: <CalendarDays /> }));
  const tarifas = painel.semLancamento.filter((movimento) => movimento.pareceTarifa);
  const total = painel.resumo.movimentos;
  const progresso = total ? Math.round((painel.resumo.conciliados / total) * 100) : 0;
  const contexto = `${contaAtual ? rotuloDaConta(contaAtual) : filtros.conta ? "Conta não encontrada" : "Todas as contas"} · ${rotuloDoMes(mes, true)}`;
  const semPar = semParDoResumo(painel.resumo);
  const emCorrecao = painel.valorDiferente.find((par) => par.movimento.id === corrigirId);
  const correcaoEmCurso = emCorrecao ? correcaoDoPar(emCorrecao, gerente) : null;
  const emCriacao = painel.semLancamento.find((movimento) => movimento.id === criarId);
  const acessoDaCriacao = { gerente, buscaCliente };
  const podeCriar = (movimento: MovimentoDoExtrato) => opcoes !== null && opcoesDeCriacao(movimento, acessoDaCriacao, outrasContasDaLinha(opcoes, movimento).length).length > 0;
  const semCriacao = (movimento: MovimentoDoExtrato) => (opcoes ? motivoSemCriacao(movimento, acessoDaCriacao, outrasContasDaLinha(opcoes, movimento).length) : null);

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
        <span className={styles.stat}><small>Valor diferente</small><strong>{painel.resumo.valorDiferente}</strong></span>
        <span className={styles.stat} title={semPar.detalhe}><small>Sem par</small><strong>{semPar.total}<span className="sr-only">: {semPar.detalhe}</span></strong></span>
        <span className={styles.stat}><small>Falta conciliar</small><strong>{valorEmReais(painel.resumo.faltaConciliar)}</strong></span>
        <span className={styles.lido}><Cloud size={14} aria-hidden="true" />{quandoFoiLido(painel.extratos, hoje)}</span>
        <Button variant="secondary" icon={<Cloud size={16} />} onClick={() => setImportando(true)} disabled={!opcoes || contas.length === 0}>Ler extrato</Button>
        {painel.resumo.sugeridos > 0 ? <Button icon={<Link2 size={16} />} onClick={() => setLote(true)} disabled={ocupado}>{painel.resumo.sugeridos === 1 ? "Conciliar o sugerido" : `Conciliar os ${painel.resumo.sugeridos} sugeridos`}</Button> : null}
      </div>
      {opcoes ? <SaldosDaFaixa escopo={escopoDoSaldoAtual} /> : null}
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
          <div className={styles.miolo}>
            {correcaoDoPar(par, gerente) ? <Button size="sm" variant="secondary" icon={<Pencil size={14} />} disabled={ocupado} onClick={() => setCorrigirId(par.movimento.id)}>Corrigir</Button> : null}
            <small>Diferença {valorEmReais(par.diferenca.replace(/^-/, ""))} {par.diferenca.startsWith("-") ? "a menos" : "a mais"} no Plugga OS</small>
          </div>
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
                {podeCriar(movimento) ? <Button size="sm" variant={lancamento || movimento.pareceTarifa ? "secondary" : "primary"} icon={<Plus size={14} />} disabled={ocupado} onClick={() => { setErro(null); setCriarId(movimento.id); }}>Criar lançamento</Button> : null}
                <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void agir("/api/financeiro/conciliacao/marcar", marcarNaConciliacaoSchema, { movimentoId: movimento.id, marcado: movimento.estado !== "marcado" }, movimento.estado === "marcado" ? "Linha retomada." : "Linha marcada como pendente.")}>{movimento.estado === "marcado" ? "Retomar" : "Marcar pendente"}</Button>
              </div>
              {candidatos.length > 1 ? <SelectField label="Lançamento" value={escolhido} onChange={(valor) => setPares((atual) => ({ ...atual, [movimento.id]: valor }))} options={candidatos.map((item) => ({ value: item.id, label: `${item.codigo} · ${item.favorecido}` }))} /> : null}
              {movimento.estado === "marcado" ? <small>Marcado como pendente.</small> : null}
              {!movimento.pareceTarifa && !podeCriar(movimento) && semCriacao(movimento) ? <small>{semCriacao(movimento)}</small> : null}
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
            {gerente ? <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => { setMotivo(""); setErroDoMotivo(null); setDesfazerId(par.movimento.id); }}>Desfazer</Button> : null}
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

    {desfazerId ? <Dialog title="Desfazer conciliação" description="A linha do extrato e o lançamento voltam a ficar sem par." variant="danger" onClose={() => setDesfazerId(null)} footer={<Button variant="danger" loading={ocupado} onClick={() => {
      const problema = problemaDoMotivo(motivo);
      setErroDoMotivo(problema);
      if (!problema) void agir("/api/financeiro/conciliacao/desfazer", desfazerConciliacaoSchema, { movimentoId: desfazerId, motivo: motivo.trim() }, "Conciliação desfeita.").then((dados) => { if (dados) setDesfazerId(null); });
    }}>Desfazer</Button>}>
      <TextareaField label="Motivo" required maxLength={500} value={motivo} onChange={(evento) => { setMotivo(evento.target.value); setErroDoMotivo(null); }} hint="Pelo menos 3 letras." error={erroDoMotivo ?? undefined} />
    </Dialog> : null}

    {emCorrecao && correcaoEmCurso ? <CorrigirNoPar par={emCorrecao} correcao={correcaoEmCurso} aoFechar={() => setCorrigirId(null)} aoCorrigido={(mensagem) => { setCorrigirId(null); setErro(null); setAviso(mensagem); router.refresh(); }} /> : null}

    {emCriacao && opcoes ? <CriarDaLinha movimento={emCriacao} opcoes={opcoes} acesso={acessoDaCriacao} acessoAosLancamentos={acessoAosLancamentos} aoFechar={() => setCriarId(null)} aoCriar={(mensagem) => { setCriarId(null); setAviso(mensagem); router.refresh(); }} /> : null}

    {tarifaId ? <TarifaDialog movimentoId={tarifaId} opcoes={opcoes} ocupado={ocupado} aoFechar={() => setTarifaId(null)} aoCriar={(corpo) => void agir("/api/financeiro/conciliacao/tarifa", criarTarifaSchema, corpo, "Tarifa criada e conciliada.").then((dados) => { if (dados) setTarifaId(null); })} /> : null}
  </div>;
}

/**
 * O saldo do Plugga OS ao lado do conferido com o extrato (PLU-339, C4): o calculado é o saldo
 * inicial mais todo o liquidado; o conciliado, só o que já tem par. A diferença é líquida e
 * desde o saldo inicial: não prova que o período está conciliado (isso é a contagem acima).
 */
function SaldosDaFaixa({ escopo }: { escopo: EscopoDoSaldo<ContaCorrente> }) {
  if (escopo.tipo === "fora") {
    const nome = escopo.conta ? rotuloDaConta(escopo.conta) : null;
    return <p className={styles.faixaSaldos}>{escopo.motivo === "inativa" ? `A conta ${nome} está inativa: o saldo dela não se calcula aqui.`
      : escopo.motivo === "outra-empresa" ? `A conta ${nome} não é da empresa escolhida: limpe a Empresa ou troque a conta para ver o saldo.`
      : "A conta deste endereço não está entre as contas do Financeiro: escolha outra para ver o saldo."}</p>;
  }
  const saldos = saldosDaConciliacao(escopo.contas);
  if (!saldos) return null;
  if (saldos.tipo !== "calculado") {
    return <p className={styles.faixaSaldos}>{saldos.tipo === "oculto"
      ? "O saldo da conta aparece só para quem acompanha pagar e receber."
      : "Sem saldo inicial, o saldo conciliado não se calcula. Cadastre o saldo inicial nas configurações do Financeiro."}</p>;
  }
  return <div className={styles.faixaSaldos} aria-label="Saldos da conciliação" role="group">
    <span className={styles.stat}><small>Saldo no Plugga OS</small><strong>{valorEmReais(saldos.calculado)}</strong></span>
    <span className={styles.stat}><small>Saldo conciliado</small><strong>{valorEmReais(saldos.conciliado)}</strong></span>
    <span className={styles.stat}><small>Diferença líquida</small><strong>{valorEmReais(saldos.diferenca)}</strong></span>
    <p>{notaDosSaldos(saldos)}</p>
  </div>;
}

/**
 * "Corrigir" no par com valor diferente (juros, multa, desconto): a mesma ação de correção da
 * ficha do lançamento, com motivo na linha do tempo. Já vem com o valor do extrato e compara com
 * o liquidado do par (na entrada recebida, o recebido, que é o que a API corrige). A falha da
 * API (um conflito por conciliação ao mesmo tempo, por exemplo) fica no próprio diálogo.
 */
function CorrigirNoPar({ par, correcao, aoFechar, aoCorrigido }: {
  par: PainelDaConciliacao["valorDiferente"][number];
  correcao: { valorInicial: string; valorAtual: string };
  aoFechar: () => void;
  aoCorrigido: (mensagem: string) => void;
}) {
  const [valor, setValor] = useState(correcao.valorInicial);
  const [motivo, setMotivo] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const doExtrato = par.movimento.valor.replace(/^-/, "");
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    const { corpo, porCampo } = corpoDaCorrecao({ valor, motivo }, correcao.valorAtual);
    setErros(porCampo);
    if (!corpo) return;
    setEnviando(true);
    const r = await enviar<unknown>(`/api/financeiro/lancamentos/${par.lancamento.id}/acoes`, "POST", corpo);
    setEnviando(false);
    if (!r.ok) { setErros(r.erro.porCampo); setFalha(r.erro.mensagem); return; }
    const codigo = par.lancamento.codigo;
    aoCorrigido(Number(corpo.valor) === Number(doExtrato)
      ? `${codigo}: valor corrigido. Com o mesmo valor do extrato, o par vai para Sugeridos.`
      : `${codigo}: valor corrigido. O valor ainda difere do extrato.`);
  }
  return <Dialog title={`Corrigir o valor de ${par.lancamento.codigo}`} size="estreita" icon={<Pencil size={20} />} onClose={aoFechar} cancelText="Voltar"
    description={`No Plugga OS: ${valorEmReais(correcao.valorAtual)}. No extrato: ${valorEmReais(doExtrato)}. A correção e o motivo ficam na linha do tempo do lançamento.`}
    footer={<Button type="submit" form="form-corrigir-no-par" icon={<Pencil size={15} />} loading={enviando}>Corrigir valor</Button>}>
    <form id="form-corrigir-no-par" className="ui-dialog-form" onSubmit={(e) => void confirmar(e)} noValidate>
      {falha ? <Alert tone="danger" title="Não deu para corrigir">{falha}</Alert> : null}
      <TextField label="Novo valor" required inputMode="decimal" prefix="R$" autoFocus value={valor} onChange={(e) => setValor(valorEmDigitacao(e.target.value))} placeholder="0,00" error={erros.valor} />
      <TextareaField label="Motivo" required maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: juros do atraso" error={erros.motivo} />
    </form>
  </Dialog>;
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
