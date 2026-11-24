import {
  ANEXO_DO_LANCAMENTO_MAX_BYTES,
  etapasDoTipo,
  rotulosDaEtapaDeLancamento,
  VALOR_MAXIMO_DO_LANCAMENTO,
  type AcaoDoLancamento,
  type AnexoDoLancamento,
  type CompanyKey,
  type EtapaDeLancamento,
  type FormaDoLancamento,
  type Lancamento,
  type NomeDaAcaoDoLancamento,
  type OpcoesDoFinanceiro,
  type TipoDeAnexo,
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
    // Sem categoria (CC14), o formulário abre com a categoria em branco para classificar.
    categoriaId: l.categoria?.id ?? "",
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
      // A categoria é opcional (CC14): sem ela, a conta fica para classificar depois.
      empresa: c.empresa, fornecedorId: c.fornecedorId, ...(c.categoriaId ? { categoriaId: c.categoriaId } : {}), contaCorrenteId: c.contaCorrenteId,
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
  // A conta que nasceu sem categoria (a da compra, CC14) se edita sem ela; a que tinha não fica sem.
  if (!depois.categoriaId && antes.categoriaId) porCampo.categoriaId = "escolha a categoria.";
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
 * A ficha do lançamento (PLU-336/337): a trilha de etapas e os anexos. O que
 * falta (`pendencias`) e a linha do tempo (`linhaDoTempo`) vêm prontos da API.
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

const diaLegivelDoIso = (dia: string) => dia.slice(0, 10).split("-").reverse().join("/");

/**
 * Agrupa a linha do tempo da API por dia de Manaus, na ordem em que ela vem (do
 * mais recente): "Hoje" e "Ontem" pelo nome, os demais como 21/11/2026.
 */
export function eventosPorDia<T extends { em: string }>(eventos: readonly T[], hoje: string): { dia: string; rotulo: string; itens: T[] }[] {
  const ontem = new Date(`${hoje}T12:00:00Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const diaDeOntem = ontem.toISOString().slice(0, 10);
  const grupos = new Map<string, T[]>();
  for (const evento of eventos) {
    const dia = diaDoIso(evento.em);
    grupos.set(dia, [...(grupos.get(dia) ?? []), evento]);
  }
  return [...grupos.entries()].map(([dia, itens]) => ({ dia, rotulo: dia === hoje ? "Hoje" : dia === diaDeOntem ? "Ontem" : diaLegivelDoIso(dia), itens }));
}

// ---------------------------------------------------------------- conector do OMIE

/**
 * O OMIE está conectado (par conferido e confirmado) para a empresa? Nulo quando não
 * se sabe (as opções falharam ou não trazem o conector): a tela segue como antes.
 */
export function omieConectado(opcoes: Pick<OpcoesDoFinanceiro, "conectores"> | null, empresa: CompanyKey): boolean | null {
  const omie = opcoes?.conectores?.omie;
  return omie && empresa in omie ? Boolean(omie[empresa]) : null;
}

/** Alguma empresa com o OMIE conectado; sem saber, como antes (sim). */
export function algumOmieConectado(opcoes: Pick<OpcoesDoFinanceiro, "conectores"> | null): boolean {
  const omie = opcoes?.conectores?.omie;
  return omie ? Object.values(omie).some(Boolean) : true;
}

/** "Tentar de novo" só com erro no envio e o conector ligado (ou sem saber). */
export const podeTentarDeNovoNoOmie = (l: Pick<Lancamento, "omie">, conectado: boolean | null): boolean => l.omie.estado === "erro" && conectado !== false;

/**
 * Os motivos curtos da fila do OMIE (PLU-342), em texto para a tela. Um motivo
 * fora da lista (o texto de uma divergência lida do OMIE) aparece como veio.
 */
const MOTIVO_DO_OMIE: Record<string, string> = {
  credenciais_invalidas: "o OMIE recusou as credenciais da empresa; a Gerente do Financeiro confere em Integrações",
  limite_de_consumo: "o limite de uso da API do OMIE foi atingido; o envio volta sozinho mais tarde",
  recusada: "o OMIE recusou o lançamento; confira categoria, conta corrente e valor",
  resposta_inesperada: "o OMIE respondeu algo inesperado",
  indisponivel: "o OMIE não respondeu",
  modo_mock: "a integração está em modo de demonstração",
  modo_sem_escrita: "a integração com o OMIE está só em leitura",
  escrita_nao_liberada: "a gravação no OMIE ainda não foi liberada",
};
/** O motivo como fim de frase: o código vira texto com ponto final; o texto cru fica como veio. */
// `Object.hasOwn`: um motivo como "constructor" passa no formato do banco e não pode cair no protótipo.
export const motivoDoOmie = (motivo: string): string => (Object.hasOwn(MOTIVO_DO_OMIE, motivo) ? `${MOTIVO_DO_OMIE[motivo]}.` : motivo);

/** O estado do lançamento no OMIE, numa frase (aba OMIE e a faixa da visão geral). */
export function fraseDoOmie(l: Pick<Lancamento, "omie" | "tipo"> & { categoria?: Lancamento["categoria"] | null; etapa?: Lancamento["etapa"] }, empresa: string): { texto: string; tom: "neutro" | "perigo" } {
  const { estado, codigo, motivo } = l.omie;
  // Sem categoria (CC14), a fila não envia: a despesa sai sozinha quando for classificada (e, se aberta, aprovada).
  if (estado === "nao_enviado" && !motivo && l.categoria === null) {
    return { texto: `Vai para o OMIE da ${empresa} depois de ${l.etapa === "aberta" ? "aprovada e classificada a categoria" : "classificada a categoria"}.`, tom: "neutro" };
  }
  switch (estado) {
    case "nao_enviado": return motivo
      ? { texto: `Ainda não está no OMIE da ${empresa}: ${motivoDoOmie(motivo)}`, tom: "neutro" }
      : { texto: `Ainda não está no OMIE: vai para a ${empresa} quando ${l.tipo === "saida" ? "for aprovada" : "for gerada"}.`, tom: "neutro" };
    case "enviando": return { texto: `Enviando ao OMIE da ${empresa}…`, tom: "neutro" };
    case "enviado": return { texto: `No OMIE da ${empresa}${codigo ? ` · código ${codigo}` : ""}.`, tom: "neutro" };
    case "baixado": return { texto: `Baixado no OMIE da ${empresa}${codigo ? ` · código ${codigo}` : ""}.`, tom: "neutro" };
    case "erro": return { texto: `Não foi ao OMIE da ${empresa}${motivo ? `: ${motivoDoOmie(motivo)}` : "."}`, tom: "perigo" };
    case "divergente": return { texto: `Diferente no OMIE da ${empresa}${motivo ? `: ${motivoDoOmie(motivo)}` : "."}`, tom: "perigo" };
  }
}

// ---------------------------------------------------------------- anexos

export const ROTULO_DO_ANEXO: Record<TipoDeAnexo, string> = { comprovante: "Comprovante", nf: "Nota fiscal", boleto: "Boleto", documento: "Documento" };

/** Comprovante, NF e boleto: um atual por lançamento; o novo substitui o atual, que fica no histórico. */
export const anexoComVersoes = (tipo: TipoDeAnexo): boolean => tipo !== "documento";

export type GrupoDeAnexo = { chave: string; tipo: TipoDeAnexo; atual: AnexoDoLancamento | null; anteriores: AnexoDoLancamento[] };

/**
 * A aba Anexos: comprovante, NF e boleto, cada um com as versões substituídas
 * (do mais recente ao mais antigo), e depois os documentos, cada um por si.
 */
export function anexosDaFicha(arquivos: readonly AnexoDoLancamento[]): GrupoDeAnexo[] {
  const grupos: GrupoDeAnexo[] = [];
  for (const tipo of ["comprovante", "nf", "boleto", "documento"] as const) {
    const doTipo = arquivos.filter((a) => a.tipo === tipo).sort((a, b) => b.enviado.em.localeCompare(a.enviado.em));
    if (!anexoComVersoes(tipo)) {
      for (const a of doTipo) grupos.push({ chave: a.id, tipo, atual: a, anteriores: [] });
      continue;
    }
    if (!doTipo.length) continue;
    const atual = doTipo.find((a) => !a.substituido) ?? null;
    grupos.push({ chave: tipo, tipo, atual, anteriores: doTipo.filter((a) => a !== atual) });
  }
  return grupos;
}

const TIPOS_DE_ARQUIVO = ["application/pdf", "image/jpeg", "image/png"];

/** Confere tipo e tamanho antes do envio; a API confere de novo pelo conteúdo. */
export function problemaDoAnexo(arquivo: { type: string; size: number } | undefined): string | null {
  if (!arquivo) return "escolha o arquivo.";
  if (!TIPOS_DE_ARQUIVO.includes(arquivo.type)) return "envie PDF, JPG ou PNG.";
  if (arquivo.size > ANEXO_DO_LANCAMENTO_MAX_BYTES) return `o arquivo passa de ${ANEXO_DO_LANCAMENTO_MAX_BYTES / 1024 / 1024} MB.`;
  return null;
}

// ---------------------------------------------------------------- ações da etapa (PLU-337)

/** O botão principal do rodapé em cada etapa, quando a API permite a ação. */
export function acaoPrincipal(l: Pick<Lancamento, "etapa" | "cancelado" | "acoesPermitidas">): { acao: NomeDaAcaoDoLancamento; rotulo: string } | null {
  if (l.cancelado) return null;
  const porEtapa: Partial<Record<EtapaDeLancamento, { acao: NomeDaAcaoDoLancamento; rotulo: string }>> = {
    aberta: { acao: "aprovar", rotulo: "Aprovar" },
    aprovada: { acao: "registrar_pagamento", rotulo: "Registrar pagamento" },
    gerada: { acao: "registrar_nf", rotulo: "Registrar NF" },
    nf_emitida: { acao: "registrar_boleto", rotulo: "Registrar boleto" },
    boleto_gerado: { acao: "registrar_envio", rotulo: "Registrar envio" },
    enviada: { acao: "registrar_recebimento", rotulo: "Registrar recebimento" },
  };
  const principal = porEtapa[l.etapa];
  return principal && l.acoesPermitidas.includes(principal.acao) ? principal : null;
}

/** Canais do envio e da cobrança (texto livre na API, até 60 caracteres). */
export const CANAIS_DE_CONTATO = ["E-mail", "WhatsApp", "Telefone", "Correio"] as const;

type Validado<T> = { corpo?: T; porCampo: Record<string, string> };
const diaValido = (dia: string, hoje: string, rotulo: string): string | null =>
  !dia ? `informe o dia ${rotulo} (dd/mm/aaaa).` : dia > hoje ? "o dia não pode ser futuro." : null;

/**
 * Pagamento da saída aprovada: forma, conta e dia (não futuro), com o comprovante
 * obrigatório (o atual já anexado ou um arquivo novo, que a tela anexa antes).
 */
export function corpoDoPagamento(c: { forma: FormaDoLancamento | ""; contaCorrenteId: string; pagoEm: string; temComprovante: boolean }, hoje: string): Validado<Extract<AcaoDoLancamento, { acao: "registrar_pagamento" }>> {
  const porCampo: Record<string, string> = {};
  if (!c.forma) porCampo.forma = "escolha a forma de pagamento.";
  if (!c.contaCorrenteId) porCampo.contaCorrenteId = "escolha a conta corrente.";
  const dia = diaValido(c.pagoEm, hoje, "do pagamento");
  if (dia) porCampo.pagoEm = dia;
  if (!c.temComprovante) porCampo.comprovante = "anexe o comprovante do pagamento.";
  if (Object.keys(porCampo).length || !c.forma) return { porCampo };
  return { porCampo, corpo: { acao: "registrar_pagamento", forma: c.forma, contaCorrenteId: c.contaCorrenteId, pagoEm: c.pagoEm } };
}

/** Recebimento da entrada: conta, dia (não futuro) e o valor recebido, que pode diferir do cobrado. */
export function corpoDoRecebimento(c: { contaCorrenteId: string; recebidoEm: string; valor: string }, hoje: string): Validado<Extract<AcaoDoLancamento, { acao: "registrar_recebimento" }>> {
  const porCampo: Record<string, string> = {};
  if (!c.contaCorrenteId) porCampo.contaCorrenteId = "escolha a conta corrente.";
  const dia = diaValido(c.recebidoEm, hoje, "do recebimento");
  if (dia) porCampo.recebidoEm = dia;
  const v = valorValido(c.valor);
  if ("problema" in v) porCampo.valor = v.problema;
  if (Object.keys(porCampo).length || !("valor" in v)) return { porCampo };
  return { porCampo, corpo: { acao: "registrar_recebimento", contaCorrenteId: c.contaCorrenteId, recebidoEm: c.recebidoEm, valor: v.valor } };
}

/** O valor digitado ("1.234,56") em decimal, ou o problema. */
function valorValido(texto: string): { valor: string } | { problema: string } {
  const valor = decimalDigitado(texto);
  if (!valor || Number(valor) <= 0) return { problema: "informe o valor, como 1.234,56." };
  if (Number(valor) > Number(VALOR_MAXIMO_DO_LANCAMENTO)) return { problema: "o valor passa do máximo permitido." };
  return { valor };
}

/** Corrigir o valor antes de liquidar: o novo valor, diferente do atual, e o motivo, que vai à linha do tempo. */
export function corpoDaCorrecao(c: { valor: string; motivo: string }, atual: string): Validado<Extract<AcaoDoLancamento, { acao: "corrigir_valor" }>> {
  const porCampo: Record<string, string> = {};
  const v = valorValido(c.valor);
  if ("problema" in v) porCampo.valor = v.problema;
  else if (Number(v.valor) === Number(atual)) porCampo.valor = "o valor é o mesmo de agora.";
  if (!c.motivo.trim()) porCampo.motivo = "diga por que o valor mudou.";
  else if (c.motivo.trim().length > 500) porCampo.motivo = "use até 500 caracteres.";
  if (Object.keys(porCampo).length || !("valor" in v)) return { porCampo };
  return { porCampo, corpo: { acao: "corrigir_valor", valor: v.valor, motivo: c.motivo.trim() } };
}

/** Na cobrança com o boleto gerado ou já enviada, corrigir o valor pede antes o boleto novo. */
export const boletoNovoNaCorrecao = (l: Pick<Lancamento, "tipo" | "etapa">): boolean => l.tipo === "entrada" && (l.etapa === "boleto_gerado" || l.etapa === "enviada");

/** Texto obrigatório de até `max` caracteres (número da NF, canal). */
export function textoDaAcao(texto: string, max: number, falta: string): string | null {
  if (!texto.trim()) return falta;
  return texto.trim().length > max ? `use até ${max} caracteres.` : null;
}
