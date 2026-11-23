import {
  categoriasDeFornecedor,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  telefoneNacional,
  rotulosDaFormaDePagamento,
  situacoesDoFornecedor,
  somenteDigitos,
  type CategoriaDeFornecedor,
  type DesempenhoDoFornecedor,
  type FormaDePagamento,
  type Fornecedor,
  type FornecedorNaLista,
} from "@plugga/shared";

/**
 * Cadastro de fornecedores (PLU-326): filtros pelo endereço, formatação e
 * textos da lista, dos cards e do formulário. Um cadastro só para Plugga e
 * Waze; o documento chega só com dígitos e é formatado aqui pelo tamanho.
 */

export const ROTA_FORNECEDORES = "/suprimentos/fornecedores";

export type SituacaoDoFornecedor = (typeof situacoesDoFornecedor)[number];

export type FiltrosDeFornecedores = {
  busca?: string;
  situacao: SituacaoDoFornecedor;
  categoria?: CategoriaDeFornecedor;
};

/** Lê os filtros do endereço; valor desconhecido cai no padrão em vez de virar erro da API. */
export function lerFiltrosDeFornecedores(parametros: { busca?: string; situacao?: string; categoria?: string }): FiltrosDeFornecedores {
  const busca = parametros.busca?.trim().slice(0, 150) || undefined;
  const situacao = situacoesDoFornecedor.find((s) => s === parametros.situacao) ?? "todos";
  const categoria = categoriasDeFornecedor.find((c) => c === parametros.categoria);
  return { busca, situacao, ...(categoria ? { categoria } : {}) };
}

/** A lista e a ficha têm endereço próprio: o mesmo link abre a mesma ficha com os mesmos filtros. */
export function hrefDeFornecedores(filtros: Partial<FiltrosDeFornecedores>, fornecedor?: string | null): string {
  const consulta = new URLSearchParams();
  if (filtros.busca) consulta.set("busca", filtros.busca);
  if (filtros.situacao && filtros.situacao !== "todos") consulta.set("situacao", filtros.situacao);
  if (filtros.categoria) consulta.set("categoria", filtros.categoria);
  if (fornecedor) consulta.set("fornecedor", fornecedor);
  const texto = consulta.toString();
  return texto ? `${ROTA_FORNECEDORES}?${texto}` : ROTA_FORNECEDORES;
}

/** 11 dígitos é CPF, 14 é CNPJ; outro tamanho volta como veio. */
export function documentoFormatado(documento: string | null): string | null {
  if (!documento) return null;
  const digitos = somenteDigitos(documento);
  if (digitos.length === 11) return formatarCpf(digitos);
  if (digitos.length === 14) return formatarCnpj(digitos);
  return documento;
}

/** Máscara enquanto se digita: CPF até 11 dígitos, CNPJ a partir do 12º. */
export function mascaraDocumento(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function mascaraTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const telefoneFormatado = (telefone: string | null): string | null => (telefone ? formatarTelefone(telefone) : null);

/** O nome do dia a dia: o fantasia quando existe, senão a razão social. */
export const nomeDoFornecedor = (f: Pick<FornecedorNaLista, "nome" | "nomeFantasia">): string => f.nomeFantasia || f.nome;

export function localDoFornecedor(f: Pick<FornecedorNaLista, "cidade" | "uf">): string | null {
  return [f.cidade, f.uf].filter(Boolean).join(" / ") || null;
}

/** "PIX · Boleto · Cartão": no card cabe o curto; o title leva o nome inteiro. */
export function formasResumidas(formas: readonly FormaDePagamento[], curto = true): string | null {
  if (formas.length === 0) return null;
  return formas.map((f) => (curto && f === "cartao_credito" ? "Cartão" : rotulosDaFormaDePagamento[f])).join(curto ? " · " : ", ");
}

export const textoDeCotacoes = (n: number): string => (n === 0 ? "Nenhuma cotação" : n === 1 ? "1 cotação" : `${n} cotações`);

export function textoDaContagem(itens: number, ativos: number): string {
  return `${itens === 1 ? "1 fornecedor" : `${itens} fornecedores`} · ${ativos === 1 ? "1 ativo" : `${ativos} ativos`}`;
}

// ---------------------------------------------------------------- ficha rica (PLU-334)

/** CEP do cadastro (8 dígitos) como 69000-000. */
export const cepFormatado = (cep: string | null): string | null => (cep ? formatarCep(cep) : null);

/** "Rua X, 120 · sala 3": a linha da rua com número e complemento. */
export function ruaDoFornecedor(f: Pick<Fornecedor, "logradouro" | "numero" | "complemento">): string | null {
  const rua = [f.logradouro?.trim(), f.numero?.trim()].filter(Boolean).join(", ");
  return [rua, f.complemento?.trim()].filter(Boolean).join(" · ") || null;
}

/** O endereço no formato do mapa do lead (o mesmo componente desenha os dois). */
export function enderecoNoMapa(f: Pick<Fornecedor, "cep" | "logradouro" | "numero" | "bairro" | "cidade" | "uf">) {
  const rua = [f.logradouro?.trim(), f.numero?.trim()].filter(Boolean).join(", ");
  return { postalCode: f.cep, street: rua || null, district: f.bairro, city: f.cidade, state: f.uf };
}

/** Ligar e WhatsApp pelo número nacional, com o 55 do país uma vez só. */
export function linksDoTelefone(telefone: string | null): { ligar: string; whatsapp: string } | null {
  const nacional = telefone ? telefoneNacional(telefone) : "";
  if (nacional.length < 10) return null;
  return { ligar: `tel:+55${nacional}`, whatsapp: `https://wa.me/55${nacional}` };
}

/** Resultado da cotação no histórico (PLU-334): a escolhida só vira vitória quando o pedido é aprovado. */
export const ROTULO_DO_RESULTADO = { venceu: "Venceu", escolhida: "Escolhida · aguardando aprovação", nao_venceu: "Não venceu" } as const;

/** Textos dos 4 cards de desempenho, no padrão da Previsão do CRM. */
export function textosDoDesempenho(d: DesempenhoDoFornecedor, diaCurtoDe: (iso: string) => string) {
  const dias = d.prazoMedioDeEntregaDias;
  return {
    cotacoes: { valor: String(d.cotacoes), nota: d.ultimaCotacaoEm ? `última em ${diaCurtoDe(d.ultimaCotacaoEm)}` : "nenhuma ainda" },
    vitorias: { valor: String(d.vitorias), nota: d.percentualDeVitorias === null ? "sem cotação ainda" : `${d.percentualDeVitorias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das cotações`, barra: d.percentualDeVitorias ?? 0 },
    prazo: { valor: dias === null ? "—" : `${dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d.u.`, nota: dias === null ? "nenhuma cotação informou" : "de entrega declarado" },
  };
}

/** Largura da barra de valor do histórico, relativa à maior cotação. */
export function larguraDaBarra(valor: string, maior: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || maior <= 0) return 0;
  return Math.max(2, Math.round((n / maior) * 100));
}

const GENERO_FEMININO = new Set(["Chave PIX"]);
const PLURAL = new Set(["Dados bancários"]);

/** "Chave PIX copiada.", "Dados bancários copiados.", "E-mail copiado.": o aviso concorda com o campo. */
export function avisoDeCopia(rotulo: string): string {
  const fim = GENERO_FEMININO.has(rotulo) ? "copiada" : "copiado";
  return `${rotulo} ${PLURAL.has(rotulo) ? `${fim}s` : fim}.`;
}
