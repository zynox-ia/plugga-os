import {
  alcancaDepartamento,
  alcancaTela,
  companyKeys,
  type Acesso,
  type CategoriaEditada,
  type CategoriaFinanceira,
  type CompanyKey,
  type ContaCorrente,
  type CriarCategoriaFinanceira,
  type CriarContaCorrente,
  type EditarCategoriaFinanceira,
  type EditarContaCorrente,
  type NaturezaDeCategoria,
  type Tela,
  type TipoDeCategoria,
} from "@plugga/shared";

/**
 * O cadastro das contas correntes e das categorias nas Configurações do Financeiro
 * (PLU-340, fatia 6), sobre a API local da PLU-342. Só a gerência do Financeiro grava;
 * a API confere de novo (controller e RLS). Nada se apaga: inativar tira dos menus.
 */

/** As telas do `@Tela` do `CadastrosDoFinanceiroController`: basta uma. */
const TELAS_DO_FINANCEIRO: readonly Tela[] = ["financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal"];

/** Gerência do Financeiro com alguma tela do módulo, ou a plataforma: a mesma exigência do controller. */
export function podeCadastrarNoFinanceiro(acesso: Acesso | null | undefined): boolean {
  if (!acesso) return false;
  return alcancaDepartamento(acesso, "financeiro", "gerente") && TELAS_DO_FINANCEIRO.some((tela) => alcancaTela(acesso, tela));
}

/** O nome da natureza no formulário; ela dá o ícone da categoria. */
export const ROTULO_DA_NATUREZA: Record<NaturezaDeCategoria, string> = {
  receita: "Receita",
  material: "Material",
  servico: "Serviço",
  telecom: "Telecomunicações",
  aluguel: "Aluguel",
  locacao: "Locação",
  imposto: "Imposto",
  pessoal: "Pessoal",
  tarifa: "Tarifa bancária",
  outros: "Outros",
};

export type ErrosDe<T> = Partial<Record<keyof T, string>>;
export type Corpo<T, C> = { ok: true; corpo: C } | { ok: false; erros: ErrosDe<T> };

const MAXIMO_DO_SALDO = 12;

/**
 * O saldo inicial digitado em reais: "1.234,56", "R$ 1500", "1500.25" ou negativo
 * ("-200,00", o cheque especial). Vazio é `null`; o que não deu para ler é `undefined`.
 */
export function saldoDigitado(texto: string): string | null | undefined {
  const limpo = texto.replace(/\s|R\$/g, "");
  if (!limpo) return null;
  const negativo = /^[-−]/.test(limpo);
  const numero = limpo.replace(/^[-−]/, "");
  let inteiro: string;
  let fracao = "";
  if (numero.includes(",")) {
    const m = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})?$/.exec(numero);
    if (!m) return undefined;
    inteiro = m[1]!.replace(/\./g, "");
    fracao = m[2] ?? "";
  } else if (/^\d{1,3}(\.\d{3})+$/.test(numero)) {
    inteiro = numero.replace(/\./g, "");
  } else {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(numero);
    if (!m) return undefined;
    inteiro = m[1]!;
    fracao = m[2] ?? "";
  }
  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  if (inteiro.length > MAXIMO_DO_SALDO) return undefined;
  const valor = `${inteiro}.${fracao.padEnd(2, "0")}`;
  return negativo && /[1-9]/.test(valor) ? `-${valor}` : valor;
}

/** "-1234.5" → "-1.234,50", para o campo de texto. */
export function saldoParaDigitar(valor: string | null | undefined): string {
  if (!valor) return "";
  const negativo = valor.startsWith("-");
  const [inteiro = "0", fracao = ""] = valor.replace(/^-/, "").split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${comMilhar},${fracao.padEnd(2, "0").slice(0, 2)}`;
}

const nomeValido = (v: string) => v.trim().length >= 2;
const opcional = (v: string): string | null => v.trim() || null;

// ---------------------------------------------------------------- conta corrente

export type CamposDaConta = {
  empresa: CompanyKey | "";
  nome: string;
  banco: string;
  agencia: string;
  numero: string;
  /** Em reais, como a pessoa digita ("1.500,00"). */
  saldoInicial: string;
  /** AAAA-MM-DD. */
  saldoInicialEm: string;
  ativa: boolean;
};

/** O formulário vazio (com a empresa do filtro, se houver) ou o da conta em edição. */
export function camposDaConta(conta?: ContaCorrente, empresa?: CompanyKey | null): CamposDaConta {
  return {
    empresa: conta?.empresa ?? empresa ?? "",
    nome: conta?.nome ?? "",
    banco: conta?.banco ?? "",
    agencia: conta?.agencia ?? "",
    numero: conta?.numero ?? "",
    saldoInicial: saldoParaDigitar(conta?.saldoInicial),
    saldoInicialEm: conta?.saldoInicialEm ?? "",
    ativa: conta?.ativa ?? true,
  };
}

/**
 * O corpo do `POST` (nova) ou do `PATCH` (edição, só o que mudou; `{}` quando nada mudou)
 * de `financeiro/contas-correntes`. O saldo inicial e o dia dele vão juntos.
 */
export function corpoDaConta(campos: CamposDaConta, original?: ContaCorrente): Corpo<CamposDaConta, CriarContaCorrente | EditarContaCorrente> {
  const erros: ErrosDe<CamposDaConta> = {};
  if (!original && !campos.empresa) erros.empresa = "escolha a empresa da conta.";
  if (!nomeValido(campos.nome)) erros.nome = "informe o nome da conta, com ao menos 2 letras.";
  const saldo = saldoDigitado(campos.saldoInicial);
  const dia = campos.saldoInicialEm.trim() || null;
  if (saldo === undefined) erros.saldoInicial = "use um valor como 1.500,00 ou -200,00.";
  else if (saldo !== null && !dia) erros.saldoInicialEm = "informe o dia do saldo inicial.";
  else if (saldo === null && dia) erros.saldoInicial = "informe o saldo inicial desse dia.";
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const dados = { nome: campos.nome.trim(), banco: opcional(campos.banco), agencia: opcional(campos.agencia), numero: opcional(campos.numero) };
  if (!original) {
    return { ok: true, corpo: { empresa: campos.empresa as CompanyKey, ...dados, ...(saldo ? { saldoInicial: saldo, saldoInicialEm: dia! } : {}) } };
  }
  const corpo: EditarContaCorrente = {};
  if (dados.nome !== original.nome) corpo.nome = dados.nome;
  if (dados.banco !== original.banco) corpo.banco = dados.banco;
  if (dados.agencia !== original.agencia) corpo.agencia = dados.agencia;
  if (dados.numero !== original.numero) corpo.numero = dados.numero;
  if (campos.ativa !== original.ativa) corpo.ativa = campos.ativa;
  if (saldo !== (original.saldoInicial ?? null) || dia !== (original.saldoInicialEm ?? null)) {
    corpo.saldoInicial = saldo;
    corpo.saldoInicialEm = dia;
  }
  return { ok: true, corpo };
}

// ---------------------------------------------------------------- categoria

export type CamposDaCategoria = {
  empresa: CompanyKey | "";
  codigo: string;
  nome: string;
  tipo: TipoDeCategoria;
  natureza: NaturezaDeCategoria;
  grupoNome: string;
  ativa: boolean;
  tarifaBancaria: boolean;
};

const CODIGO = /^\d\.\d{2}\.\d{2}$/;
const prefixo = (codigo: string) => codigo.trim().split(".").slice(0, 2).join(".");

/** O formulário vazio (despesa, natureza "outros") ou o da categoria em edição. */
export function camposDaCategoria(c?: CategoriaFinanceira, empresa?: CompanyKey | null): CamposDaCategoria {
  return {
    empresa: c?.empresa ?? empresa ?? "",
    codigo: c?.codigo ?? "",
    nome: c?.nome ?? "",
    tipo: c?.tipo ?? "despesa",
    natureza: c?.natureza ?? "outros",
    grupoNome: c?.grupo.nome ?? "",
    ativa: c?.ativa ?? true,
    tarifaBancaria: c?.tarifaBancaria ?? false,
  };
}

/**
 * O nome do grupo do código ("2.01" de "2.01.07") no plano da empresa, se o grupo já
 * existe: a API exige um nome só por grupo. `exceto` deixa de fora a própria categoria.
 */
export function nomeDoGrupo(categorias: readonly CategoriaFinanceira[], empresa: CompanyKey, codigo: string, exceto?: string): string | null {
  if (!/^\d\.\d{2}/.test(codigo.trim())) return null;
  const p = prefixo(codigo);
  return categorias.find((c) => c.empresa === empresa && c.id !== exceto && c.grupo.codigo === p)?.grupo.nome ?? null;
}

/** Renomear o grupo inteiro ainda não entra: só a categoria sozinha no grupo muda o nome dele. */
export function grupoEditavel(categorias: readonly CategoriaFinanceira[], categoria: CategoriaFinanceira): boolean {
  return nomeDoGrupo(categorias, categoria.empresa, categoria.codigo, categoria.id) === null;
}

/**
 * O corpo do `POST` (nova) ou do `PATCH` (edição: nome, natureza, grupo, situação e a
 * marca das tarifas, só o que mudou) de `financeiro/categorias`. Código, tipo e empresa
 * não mudam depois. Marcar a das tarifas desmarca a anterior da empresa (na API).
 */
export function corpoDaCategoria(
  campos: CamposDaCategoria,
  categorias: readonly CategoriaFinanceira[],
  original?: CategoriaFinanceira,
): Corpo<CamposDaCategoria, CriarCategoriaFinanceira | EditarCategoriaFinanceira> {
  const erros: ErrosDe<CamposDaCategoria> = {};
  const codigo = campos.codigo.trim();
  const grupoNome = campos.grupoNome.trim();
  if (!original) {
    if (!campos.empresa) erros.empresa = "escolha a empresa da categoria.";
    if (!CODIGO.test(codigo)) erros.codigo = "use o formato 2.01.01.";
    else if (campos.empresa && categorias.some((c) => c.empresa === campos.empresa && c.codigo === codigo)) erros.codigo = `já existe a categoria ${codigo} nesta empresa.`;
  }
  if (!nomeValido(campos.nome)) erros.nome = "informe o nome da categoria, com ao menos 2 letras.";
  if (grupoNome.length < 2) erros.grupoNome = "informe o nome do grupo, com ao menos 2 letras.";
  else if (!original && campos.empresa && CODIGO.test(codigo)) {
    const existente = nomeDoGrupo(categorias, campos.empresa, codigo);
    if (existente && existente !== grupoNome) erros.grupoNome = `o grupo ${prefixo(codigo)} já se chama "${existente}".`;
  } else if (original && grupoNome !== original.grupo.nome && !grupoEditavel(categorias, original)) {
    erros.grupoNome = `o nome do grupo vale para todas as categorias do ${original.grupo.codigo}; renomear o grupo inteiro ainda não está disponível.`;
  }
  const tipo = original?.tipo ?? campos.tipo;
  if (campos.tarifaBancaria && tipo !== "despesa") erros.tarifaBancaria = "só uma categoria de despesa pode ser a das tarifas bancárias.";
  else if (campos.tarifaBancaria && !campos.ativa) erros.tarifaBancaria = "categoria inativa não pode ser a das tarifas bancárias.";
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const nome = campos.nome.trim();
  if (!original) {
    return { ok: true, corpo: {
      empresa: campos.empresa as CompanyKey, codigo, nome, tipo: campos.tipo, natureza: campos.natureza, grupoNome,
      ...(campos.tarifaBancaria ? { tarifaBancaria: true } : {}),
    } };
  }
  const corpo: EditarCategoriaFinanceira = {};
  if (nome !== original.nome) corpo.nome = nome;
  if (campos.natureza !== original.natureza) corpo.natureza = campos.natureza;
  if (grupoNome !== original.grupo.nome) corpo.grupoNome = grupoNome;
  if (campos.ativa !== original.ativa) corpo.ativa = campos.ativa;
  // Inativar a marcada já tira a marca na API: a tela não manda as duas coisas.
  const marcada = original.tarifaBancaria ?? false;
  if (campos.tarifaBancaria !== marcada && !(corpo.ativa === false && !campos.tarifaBancaria)) corpo.tarifaBancaria = campos.tarifaBancaria;
  return { ok: true, corpo };
}

// ---------------------------------------------------------------- tarifas bancárias (Preferências)

/** A categoria do "Criar tarifa" da Conciliação na empresa, se houver. */
export function categoriaDasTarifas(categorias: readonly CategoriaFinanceira[], empresa: CompanyKey): CategoriaFinanceira | null {
  return categorias.find((c) => c.empresa === empresa && c.tarifaBancaria) ?? null;
}

/** As que podem ser a das tarifas: despesas ativas da empresa, na ordem do código. */
export function opcoesDasTarifas(categorias: readonly CategoriaFinanceira[], empresa: CompanyKey): CategoriaFinanceira[] {
  return categorias
    .filter((c) => c.empresa === empresa && c.tipo === "despesa" && c.ativa)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

/**
 * Os `PATCH` das Preferências: por empresa, o id escolhido ("" é nenhuma). Trocar marca a
 * nova (a API desmarca a anterior na mesma transação); nenhuma desmarca a atual.
 */
export function mudancasDasTarifas(categorias: readonly CategoriaFinanceira[], escolhas: Partial<Record<CompanyKey, string>>): { id: string; corpo: { tarifaBancaria: boolean } }[] {
  const mudancas: { id: string; corpo: { tarifaBancaria: boolean } }[] = [];
  for (const [empresa, escolhida] of Object.entries(escolhas) as [CompanyKey, string | undefined][]) {
    if (escolhida === undefined) continue;
    const atual = categoriaDasTarifas(categorias, empresa)?.id ?? "";
    if (escolhida === atual) continue;
    mudancas.push(escolhida ? { id: escolhida, corpo: { tarifaBancaria: true } } : { id: atual, corpo: { tarifaBancaria: false } });
  }
  return mudancas;
}

/** O que as Preferências mostram por empresa: a escolha ainda não salva ou, sem ela, a marca atual ("" é nenhuma). */
export function escolhasDasTarifas(categorias: readonly CategoriaFinanceira[], rascunho: Partial<Record<CompanyKey, string>>): Record<CompanyKey, string> {
  return Object.fromEntries(companyKeys.map((e) => [e, rascunho[e] ?? categoriaDasTarifas(categorias, e)?.id ?? ""])) as Record<CompanyKey, string>;
}

/**
 * O rascunho sem as empresas cujo `PATCH` voltou: a que falhou continua pendente, com
 * a escolha de quem usa, para tentar de novo. A empresa vem da categoria salva. Só sai
 * a escolha que foi enviada: se a pessoa trocou a empresa enquanto o `PATCH` estava em
 * voo, a troca mais nova continua pendente.
 */
export function rascunhoSemAsSalvas(
  atual: Partial<Record<CompanyKey, string>>,
  enviado: Partial<Record<CompanyKey, string>>,
  salvas: readonly CategoriaFinanceira[],
): Partial<Record<CompanyKey, string>> {
  const confirmadas = new Set(salvas.map((c) => c.empresa));
  return Object.fromEntries(Object.entries(atual).filter(([e, v]) => !(confirmadas.has(e as CompanyKey) && enviado[e as CompanyKey] === v))) as Partial<Record<CompanyKey, string>>;
}

// ---------------------------------------------------------------- a lista depois de salvar

/** A categoria salva no lugar dela (ou no fim); a que perdeu a marca das tarifas fica sem ela. */
export function comCategoriaSalva(categorias: readonly CategoriaFinanceira[], salva: CategoriaEditada): CategoriaFinanceira[] {
  const { desmarcada, ...categoria } = salva;
  const lista = categorias.map((c) => {
    if (c.id === categoria.id) return categoria;
    if (c.id === desmarcada?.id || (categoria.tarifaBancaria && c.empresa === categoria.empresa && c.tarifaBancaria)) return { ...c, tarifaBancaria: false };
    return c;
  });
  return lista.some((c) => c.id === categoria.id) ? lista : [...lista, categoria];
}

/**
 * A conta salva no lugar dela (ou no fim). A resposta do cadastro não traz o saldo
 * calculado: ele fica o mesmo se o saldo inicial não mudou e some se mudou, até a
 * próxima leitura das opções.
 */
export function comContaSalva(contas: readonly ContaCorrente[], salva: ContaCorrente): ContaCorrente[] {
  const anterior = contas.find((c) => c.id === salva.id);
  if (!anterior) return [...contas, salva];
  const mesmoSaldo = (anterior.saldoInicial ?? null) === (salva.saldoInicial ?? null) && (anterior.saldoInicialEm ?? null) === (salva.saldoInicialEm ?? null);
  const conta: ContaCorrente = { ...salva, saldoCalculado: mesmoSaldo ? anterior.saldoCalculado ?? null : null, saldoConciliado: mesmoSaldo ? anterior.saldoConciliado ?? null : null };
  return contas.map((c) => (c.id === salva.id ? conta : c));
}
