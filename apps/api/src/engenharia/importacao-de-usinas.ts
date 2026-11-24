import { MAPEAMENTO_PADRAO_DA_IMPORTACAO, potenciaKwpSchema, type CampoDaImportacao, type CompanyKey } from "@plugga/shared";

/**
 * Importação única da planilha de levantamento (E3, PLU-347), em funções puras:
 * ler o CSV, achar as colunas pelo mapeamento e normalizar cada linha. O
 * casamento com clientes, UCs e plataformas fica no repositório. Nenhuma linha
 * da planilha vai para log ou evento.
 */

/** CSV com aspas (RFC 4180), separado por vírgula ou ponto e vírgula (o do Excel em português). */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const separador = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i]!;
    if (entreAspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') entreAspas = false;
      else campo += c;
    } else if (c === '"') entreAspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i += 1;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

const normalizar = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export type LinhaLida = {
  linha: number;
  valores: Partial<Record<CampoDaImportacao, string>>;
};

/** Acha as colunas pelo cabeçalho (sem diferenciar maiúsculas e acentos). Sem as obrigatórias, recusa a planilha. */
export function lerLinhas(csv: string[][], mapeamento: Partial<Record<CampoDaImportacao, string>>): { linhas: LinhaLida[]; faltando: CampoDaImportacao[] } {
  const [cabecalho = [], ...dados] = csv;
  const indice = new Map(cabecalho.map((h, i) => [normalizar(h), i]));
  const colunas = Object.fromEntries(
    (Object.keys(MAPEAMENTO_PADRAO_DA_IMPORTACAO) as CampoDaImportacao[]).map((campo) => [campo, indice.get(normalizar(mapeamento[campo] ?? MAPEAMENTO_PADRAO_DA_IMPORTACAO[campo]))]),
  ) as Record<CampoDaImportacao, number | undefined>;
  const obrigatorios: CampoDaImportacao[] = ["cliente", "uc", "nome", "plataforma", "potenciaKwp"];
  const faltando = obrigatorios.filter((campo) => colunas[campo] === undefined);
  if (faltando.length > 0) return { linhas: [], faltando };
  return {
    faltando,
    linhas: dados.map((valores, i) => ({
      linha: i + 2,
      valores: Object.fromEntries(
        Object.entries(colunas).flatMap(([campo, coluna]) => (coluna === undefined ? [] : [[campo, (valores[coluna] ?? "").trim()]])),
      ) as Partial<Record<CampoDaImportacao, string>>,
    })),
  };
}

export type LinhaNormalizada = {
  linha: number;
  cliente: string;
  uc: string;
  nome: string;
  plataforma: string;
  potenciaKwp: string | null;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  comissionadaEm: string | null;
  empresa: CompanyKey | null;
  problemas: string[];
};

/** dd/mm/aaaa ou aaaa-mm-dd → aaaa-mm-dd; inválida → nulo. */
export function lerData(valor: string): string | null {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const [ano, mes, dia] = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0];
  if (!ano) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data.toISOString().slice(0, 10);
}

/** Empresa pela coluna ("Waze", "Waze Energia", "Plugga"), ou a padrão. */
export function lerEmpresa(valor: string | undefined, padrao: CompanyKey): CompanyKey | null {
  if (!valor) return padrao;
  const v = normalizar(valor);
  if (v.startsWith("waze")) return "waze";
  if (v.startsWith("plugga")) return "plugga";
  return null;
}

/** Normaliza a linha e anota o que já se sabe errado, antes de casar com o cadastro. */
export function normalizarLinha(lida: LinhaLida, empresaPadrao: CompanyKey, hoje: string): LinhaNormalizada {
  const v = lida.valores;
  const problemas: string[] = [];
  for (const [campo, rotulo] of [["cliente", "cliente"], ["uc", "UC"], ["nome", "nome da usina"], ["plataforma", "plataforma"]] as const) {
    if (!v[campo]) problemas.push(`falta o ${rotulo}`);
  }
  const potencia = potenciaKwpSchema.safeParse(v.potenciaKwp ?? "");
  if (!potencia.success) problemas.push("potência em kWp inválida");
  const comissionadaEm = v.comissionadaEm ? lerData(v.comissionadaEm) : null;
  if (v.comissionadaEm && !comissionadaEm) problemas.push("data de comissionamento inválida (use dd/mm/aaaa)");
  if (comissionadaEm && comissionadaEm > hoje) problemas.push("comissionamento no futuro");
  const empresa = lerEmpresa(v.empresa, empresaPadrao);
  if (!empresa) problemas.push("empresa desconhecida (use Plugga ou Waze)");
  const texto = (campo: CampoDaImportacao, max: number) => (v[campo] ? v[campo]!.slice(0, max) : null);
  return {
    linha: lida.linha,
    cliente: v.cliente ?? "",
    uc: v.uc ?? "",
    nome: (v.nome ?? "").slice(0, 120),
    plataforma: v.plataforma ?? "",
    potenciaKwp: potencia.success ? potencia.data : null,
    fabricante: texto("fabricante", 120),
    modelo: texto("modelo", 120),
    numeroSerie: texto("numeroSerie", 120),
    comissionadaEm,
    empresa,
    problemas,
  };
}

/** Código de UC comparável: só dígitos e letras, sem "UC" na frente. */
export const codigoDeUc = (valor: string): string => normalizar(valor).replace(/^uc\s*/, "").replace(/[^a-z0-9]/g, "");
export const nomeComparavel = normalizar;
