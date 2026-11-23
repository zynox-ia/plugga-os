import {
  etapasDoTipo,
  rotulosDaEtapaDeLancamento,
  VALOR_MAXIMO_DO_LANCAMENTO,
  type CompanyKey,
  type EtapaDeLancamento,
  type FormaDoLancamento,
  type Lancamento,
  type OpcoesDoFinanceiro,
} from "@plugga/shared";

import { decimalDigitado } from "./compras.ts";
import { diaDoIso } from "./ficha-do-pedido.ts";

export const ROTULO_DA_FORMA: Record<FormaDoLancamento, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao_credito: "Cartão de crédito",
  transferencia: "Transferência",
  debito_automatico: "Débito automático",
};

// ---------------------------------------------------------------- nova conta a pagar e edição

export type CamposDaContaAPagar = {
  empresa: CompanyKey | null;
  fornecedorId: string;
  categoriaId: string;
  contaCorrenteId: string;
  descricao: string;
  /** Como a pessoa digitou ("1.234,56"). */
  valor: string;
  vencimento: string;
  forma: FormaDoLancamento | "";
  observacao: string;
};

export const contaAPagarVazia = (): CamposDaContaAPagar => ({ empresa: null, fornecedorId: "", categoriaId: "", contaCorrenteId: "", descricao: "", valor: "", vencimento: "", forma: "boleto", observacao: "" });

export function camposDoLancamento(l: Lancamento): CamposDaContaAPagar {
  return {
    empresa: l.empresa,
    fornecedorId: l.favorecido.id,
    categoriaId: l.categoria.id,
    contaCorrenteId: l.contaCorrente?.id ?? "",
    descricao: l.descricao,
    valor: Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    vencimento: l.vencimento,
    forma: l.forma ?? "",
    observacao: l.observacao ?? "",
  };
}

/** Categorias de despesa ativas da empresa, agrupadas como no OMIE ("2.01 · Materiais"). */
export function categoriasDaSaida(opcoes: Pick<OpcoesDoFinanceiro, "categorias">, empresa: CompanyKey | null, atual?: string) {
  if (!empresa) return [];
  return opcoes.categorias
    .filter((c) => c.empresa === empresa && c.tipo === "despesa" && (c.ativa || c.id === atual))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

export const contasDaEmpresa = (opcoes: Pick<OpcoesDoFinanceiro, "contasCorrentes">, empresa: CompanyKey | null, atual?: string) =>
  empresa ? opcoes.contasCorrentes.filter((c) => c.empresa === empresa && (c.ativa || c.id === atual)) : [];

/** Na digitação e no colar, o campo de valor guarda só dígitos, ponto e vírgula ("abc1.234,56" → "1.234,56"). */
export const valorEmDigitacao = (texto: string): string => texto.replace(/[^\d.,]/g, "");

/**
 * Valida a nova conta a pagar e monta o corpo do POST. Os erros vêm com o nome
 * do campo da API, para casar com os erros que ela devolve.
 */
export function corpoDaNovaContaAPagar(c: CamposDaContaAPagar): { corpo?: Record<string, unknown>; porCampo: Record<string, string> } {
  const porCampo: Record<string, string> = {};
  if (!c.empresa) porCampo.empresa = "escolha a empresa (Plugga ou Waze Energia).";
  if (!c.fornecedorId) porCampo.fornecedorId = "escolha o fornecedor ou favorecido.";
  if (!c.descricao.trim()) porCampo.descricao = "descreva o que pagar.";
  else if (c.descricao.trim().length > 200) porCampo.descricao = "use até 200 caracteres.";
  if (!c.categoriaId) porCampo.categoriaId = c.empresa ? "escolha a categoria do OMIE." : "escolha a empresa primeiro.";
  if (!c.contaCorrenteId) porCampo.contaCorrenteId = c.empresa ? "escolha a conta corrente." : "escolha a empresa primeiro.";
  const valor = decimalDigitado(c.valor);
  if (!valor || Number(valor) <= 0) porCampo.valor = "informe o valor, como 1.234,56.";
  else if (Number(valor) > Number(VALOR_MAXIMO_DO_LANCAMENTO)) porCampo.valor = "o valor passa do máximo permitido.";
  if (!c.vencimento) porCampo.vencimento = "informe o vencimento (dd/mm/aaaa).";
  if (!c.forma) porCampo.forma = "escolha a forma de pagamento.";
  if (Object.keys(porCampo).length) return { porCampo };
  return {
    porCampo,
    corpo: {
      empresa: c.empresa, fornecedorId: c.fornecedorId, categoriaId: c.categoriaId, contaCorrenteId: c.contaCorrenteId,
      descricao: c.descricao.trim(), valor, vencimento: c.vencimento, forma: c.forma,
      ...(c.observacao.trim() ? { observacao: c.observacao.trim() } : {}),
    },
  };
}

/**
 * Edição antes de pagar: só o que mudou vai no PATCH. Empresa e valor não se
 * editam aqui (o valor muda pela ação "Corrigir valor", com motivo).
 */
export function corpoDaEdicao(antes: CamposDaContaAPagar, depois: CamposDaContaAPagar): { corpo: Record<string, unknown>; porCampo: Record<string, string> } {
  const porCampo: Record<string, string> = {};
  if (!depois.descricao.trim()) porCampo.descricao = "descreva o que pagar.";
  else if (depois.descricao.trim().length > 200) porCampo.descricao = "use até 200 caracteres.";
  if (!depois.vencimento) porCampo.vencimento = "informe o vencimento (dd/mm/aaaa).";
  if (!depois.categoriaId) porCampo.categoriaId = "escolha a categoria do OMIE.";
  if (!depois.contaCorrenteId) porCampo.contaCorrenteId = "escolha a conta corrente.";
  if (!depois.forma) porCampo.forma = "escolha a forma de pagamento.";
  const corpo: Record<string, unknown> = {};
  for (const campo of ["fornecedorId", "categoriaId", "contaCorrenteId", "vencimento", "forma"] as const) {
    if (depois[campo] !== antes[campo]) corpo[campo] = depois[campo];
  }
  if (depois.descricao.trim() !== antes.descricao.trim()) corpo.descricao = depois.descricao.trim();
  if (depois.observacao.trim() !== antes.observacao.trim()) corpo.observacao = depois.observacao.trim() || null;
  return { corpo, porCampo };
}

/** Na saída aprovada, fornecedor, conta, forma e vencimento só mudam pela Gerente do Financeiro (regra da API). */
export const camposTravadosNaAprovada = (l: Pick<Lancamento, "tipo" | "etapa">, gerente: boolean): boolean => l.tipo === "saida" && l.etapa === "aprovada" && !gerente;

/**
 * A ficha do lançamento (PLU-336/337): a trilha de etapas, o que falta para
 * avançar e a linha do tempo, todos derivados do contrato. A tela só desenha.
 */

export type PassoDaTrilha = { etapa: EtapaDeLancamento; rotulo: string; estado: "feito" | "atual" | "futuro" | "cancelado" };

/** As etapas do tipo, marcadas até a atual. No cancelado, a atual é onde parou. */
export function trilhaDoLancamento(l: Pick<Lancamento, "tipo" | "etapa" | "cancelado">): PassoDaTrilha[] {
  const etapas = etapasDoTipo[l.tipo];
  const atual = etapas.indexOf(l.etapa);
  return etapas.map((etapa, i) => ({
    etapa,
    rotulo: rotulosDaEtapaDeLancamento[etapa],
    estado: i < atual ? "feito" : i === atual ? (l.cancelado ? "cancelado" : "atual") : "futuro",
  }));
}

/** A 390 px a trilha vira "2 de 4 · Aprovada", com a próxima etapa. */
export function resumoDaTrilhaDoLancamento(l: Pick<Lancamento, "tipo" | "etapa" | "cancelado">): { posicao: number; total: number; atual: string; proxima: string | null } {
  const etapas = etapasDoTipo[l.tipo];
  const i = etapas.indexOf(l.etapa);
  const proxima = !l.cancelado && i + 1 < etapas.length ? rotulosDaEtapaDeLancamento[etapas[i + 1]!] : null;
  return { posicao: i + 1, total: etapas.length, atual: l.cancelado ? `Cancelada em ${rotulosDaEtapaDeLancamento[l.etapa]}` : rotulosDaEtapaDeLancamento[l.etapa], proxima };
}

export type PendenciaDoLancamento = { texto: string; feito: boolean; opcional?: boolean };

/** "O que falta" da etapa atual. Vazio quando não há o que fazer (conciliado ou cancelado). */
export function pendenciasDoLancamento(l: Pick<Lancamento, "tipo" | "etapa" | "cancelado" | "anexos" | "categoria" | "omie">): PendenciaDoLancamento[] {
  if (l.cancelado) return [];
  const noOmie = l.omie.estado === "enviado" || l.omie.estado === "baixado";
  switch (l.etapa) {
    case "aberta": return [
      { texto: `Categoria do OMIE: ${l.categoria.nome}`, feito: true },
      { texto: "Boleto ou NF anexado", feito: l.anexos > 0, opcional: true },
      { texto: "Aprovação da Gerente do Financeiro", feito: false },
    ];
    case "aprovada": return [
      { texto: "Conta no OMIE", feito: noOmie },
      { texto: "Pagamento com comprovante", feito: false },
    ];
    case "paga": return [{ texto: "Pagamento com comprovante", feito: true }, { texto: "Conciliação com o extrato", feito: false }];
    case "gerada": return [{ texto: "Título no OMIE", feito: noOmie }, { texto: "Emitir a NF", feito: false }];
    case "nf_emitida": return [{ texto: "NF emitida", feito: true }, { texto: "Gerar o boleto", feito: false }];
    case "boleto_gerado": return [{ texto: "Boleto gerado", feito: true }, { texto: "Enviar ao cliente", feito: false }];
    case "enviada": return [{ texto: "Enviada ao cliente", feito: true }, { texto: "Receber o pagamento", feito: false }];
    case "recebida": return [{ texto: "Recebimento registrado", feito: true }, { texto: "Conciliação com o extrato", feito: false }];
    case "conciliada": return [];
  }
}

export type IconeDoEvento = "criado" | "aprovado" | "pago" | "recebido" | "conciliado" | "cancelado";
export type EventoDoLancamento = { chave: string; icone: IconeDoEvento; em: string; quem: string | null; texto: string; nota?: string };

/** Os marcos do lançamento como eventos, do mais recente para o mais antigo. */
export function eventosDoLancamento(l: Pick<Lancamento, "tipo" | "marcos" | "etapa">): EventoDoLancamento[] {
  const { marcos } = l;
  const eventos: EventoDoLancamento[] = [{ chave: "criado", icone: "criado", em: marcos.criado.em, quem: marcos.criado.por?.nome ?? null, texto: l.tipo === "saida" ? "criou a conta a pagar" : "gerou a cobrança" }];
  if (marcos.aprovado) eventos.push({ chave: "aprovado", icone: "aprovado", em: marcos.aprovado.em, quem: marcos.aprovado.por?.nome ?? null, texto: "aprovou a conta" });
  if (marcos.pago) eventos.push({ chave: "pago", icone: "pago", em: marcos.pago.em, quem: marcos.pago.por?.nome ?? null, texto: `registrou o pagamento de ${diaLegivelDoIso(marcos.pago.pagoEm)}` });
  if (marcos.recebido) eventos.push({ chave: "recebido", icone: "recebido", em: marcos.recebido.em, quem: marcos.recebido.por?.nome ?? null, texto: `registrou o recebimento de ${diaLegivelDoIso(marcos.recebido.recebidoEm)}` });
  if (marcos.conciliado) eventos.push({ chave: "conciliado", icone: "conciliado", em: marcos.conciliado.em, quem: marcos.conciliado.por?.nome ?? null, texto: "conciliou com o extrato" });
  if (marcos.cancelado) eventos.push({ chave: "cancelado", icone: "cancelado", em: marcos.cancelado.em, quem: marcos.cancelado.por?.nome ?? null, texto: `cancelou na etapa ${rotulosDaEtapaDeLancamento[l.etapa]}`, nota: marcos.cancelado.motivo });
  return eventos.sort((a, b) => b.em.localeCompare(a.em));
}

const diaLegivelDoIso = (dia: string) => dia.slice(0, 10).split("-").reverse().join("/");

/** Agrupa por dia de Manaus, do mais recente: "Hoje" e "Ontem" pelo nome, os demais como 21/11/2026. */
export function eventosPorDia(eventos: EventoDoLancamento[], hoje: string): { dia: string; rotulo: string; itens: EventoDoLancamento[] }[] {
  const ontem = new Date(`${hoje}T12:00:00Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const diaDeOntem = ontem.toISOString().slice(0, 10);
  const grupos = new Map<string, EventoDoLancamento[]>();
  for (const evento of eventos) {
    const dia = diaDoIso(evento.em);
    grupos.set(dia, [...(grupos.get(dia) ?? []), evento]);
  }
  return [...grupos.entries()].map(([dia, itens]) => ({ dia, rotulo: dia === hoje ? "Hoje" : dia === diaDeOntem ? "Ontem" : diaLegivelDoIso(dia), itens }));
}

/** O estado do lançamento no OMIE, numa frase (aba OMIE e a faixa da visão geral). */
export function fraseDoOmie(l: Pick<Lancamento, "omie" | "tipo">, empresa: string): { texto: string; tom: "neutro" | "perigo" } {
  const { estado, codigo, motivo } = l.omie;
  switch (estado) {
    case "nao_enviado": return { texto: `Ainda não está no OMIE: vai para a ${empresa} quando ${l.tipo === "saida" ? "for aprovada" : "for gerada"}.`, tom: "neutro" };
    case "enviando": return { texto: `Enviando ao OMIE da ${empresa}…`, tom: "neutro" };
    case "enviado": return { texto: `No OMIE da ${empresa}${codigo ? ` · código ${codigo}` : ""}.`, tom: "neutro" };
    case "baixado": return { texto: `Baixado no OMIE da ${empresa}${codigo ? ` · código ${codigo}` : ""}.`, tom: "neutro" };
    case "erro": return { texto: `Não foi ao OMIE da ${empresa}${motivo ? `: ${motivo}` : "."}`, tom: "perigo" };
    case "divergente": return { texto: `Diferente no OMIE da ${empresa}${motivo ? `: ${motivo}` : "."}`, tom: "perigo" };
  }
}
