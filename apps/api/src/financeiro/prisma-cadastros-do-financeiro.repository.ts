import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CategoriaEditada,
  CategoriaFinanceira,
  CompanyKey,
  ContaCorrente,
  CriarCategoriaFinanceira,
  CriarContaCorrente,
  EditarCategoriaFinanceira,
  EditarContaCorrente,
  NomeDeEventoDoCatalogo,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import { PrismaService } from "../prisma/prisma.service";

type LinhaDaCategoria = Prisma.CategoriaFinanceiraGetPayload<object>;
type LinhaDaConta = Prisma.ContaCorrenteGetPayload<object>;

export const paraCategoria = (c: LinhaDaCategoria): CategoriaFinanceira => ({
  id: c.id,
  empresa: c.companyId as CompanyKey,
  codigo: c.codigo,
  nome: c.nome,
  tipo: c.tipo,
  natureza: c.natureza,
  grupo: { codigo: prefixoDoGrupo(c.codigo), nome: c.grupoNome },
  ativa: c.ativa,
  tarifaBancaria: c.tarifaBancaria,
});

export const paraConta = (c: LinhaDaConta): ContaCorrente => ({
  id: c.id,
  empresa: c.companyId as CompanyKey,
  nome: c.nome,
  banco: c.banco,
  agencia: c.agencia,
  numero: c.numero,
  saldo: c.saldo?.toFixed(2) ?? null,
  saldoLidoEm: c.saldoLidoEm?.toISOString() ?? null,
  saldoInicial: c.saldoInicial?.toFixed(2) ?? null,
  saldoInicialEm: c.saldoInicialEm ? diaEmManaus(c.saldoInicialEm) : null,
  ativa: c.ativa,
});

/** O saldo inicial do contrato no formato do banco (o dia vira o início do dia de Manaus). */
const saldoInicialParaOBanco = (input: { saldoInicial?: string | null; saldoInicialEm?: string | null }) =>
  input.saldoInicial === undefined ? {}
    : input.saldoInicial === null ? { saldoInicial: null, saldoInicialEm: null }
    : { saldoInicial: new Prisma.Decimal(input.saldoInicial), saldoInicialEm: inicioDoDiaEmManaus(input.saldoInicialEm!) };

const soDespesaEDeTarifas = () => new RequisicaoInvalida("Só uma categoria de despesa pode ser a de tarifas bancárias.", [
  { campo: "tarifaBancaria", problema: "Só categoria de despesa." },
]);

/** O grupo é o prefixo de dois níveis do código ("2.01" de "2.01.07"). */
const prefixoDoGrupo = (codigo: string): string => codigo.split(".").slice(0, 2).join(".");

/** Os campos que mudaram, para o evento: nomes, nunca valores. */
const camposAlterados = <T extends object>(antes: T, depois: Partial<T>): string[] =>
  (Object.keys(depois) as (keyof T)[]).filter((k) => depois[k] !== undefined && depois[k] !== antes[k]).map(String);

/**
 * O plano de contas e as contas correntes do Plugga OS (PLU-342, S3b). Só a gerência do
 * Financeiro grava: o controller confere, e o RLS também (política de INSERT e UPDATE
 * com `tem_tela(..., true)`). Nada se apaga; desativar tira dos menus.
 */
@Injectable()
export class PrismaCadastrosDoFinanceiroRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async criarCategoria(input: CriarCategoriaFinanceira, principal: AuthPrincipal): Promise<CategoriaEditada> {
    const { tarifaBancaria, ...dados } = input;
    if (tarifaBancaria && dados.tipo !== "despesa") throw soDespesaEDeTarifas();
    try {
      return await this.prisma.comContexto(async (tx) => {
        // O grupo é o prefixo do código ("2.01"): a tela agrupa por ele, então o nome é um só.
        const nomes = await this.nomesDoGrupo(tx, dados.empresa, dados.codigo);
        if (nomes.length > 0 && !nomes.includes(dados.grupoNome)) {
          const problema = `O grupo ${prefixoDoGrupo(dados.codigo)} já se chama "${nomes[0]}".`;
          throw new RequisicaoInvalida(problema, [{ campo: "grupoNome", problema }]);
        }
        const desmarcada = tarifaBancaria ? await this.tirarAMarcaDeTarifas(tx, dados.empresa, principal) : undefined;
        const criada = await tx.categoriaFinanceira.create({
          data: { companyId: dados.empresa, codigo: dados.codigo, nome: dados.nome, tipo: dados.tipo, natureza: dados.natureza, grupoNome: dados.grupoNome, tarifaBancaria: tarifaBancaria ?? false },
        });
        await this.registrar(tx, "financeiro.categoria.created", "categoria_financeira", criada.id, criada.companyId, principal, { codigo: criada.codigo, tipo: criada.tipo, tarifaBancaria: criada.tarifaBancaria });
        return { ...paraCategoria(criada), ...(desmarcada ? { desmarcada } : {}) };
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito(`Já existe a categoria ${dados.codigo} nesta empresa.`, [{ campo: "codigo", problema: "Um código por empresa." }]);
      }
      throw erro;
    }
  }

  async editarCategoria(id: string, input: EditarCategoriaFinanceira, principal: AuthPrincipal): Promise<CategoriaEditada> {
    return this.prisma.comContexto(async (tx) => {
      const antes = await tx.categoriaFinanceira.findUnique({ where: { id } });
      if (!antes) throw new NaoEncontrado("Categoria não encontrada.");
      const ativa = input.ativa ?? antes.ativa;
      if (input.tarifaBancaria && antes.tipo !== "despesa") throw soDespesaEDeTarifas();
      if (input.tarifaBancaria && !ativa) {
        throw new EstadoInvalido("Categoria inativa não pode ser a de tarifas bancárias. Reative a categoria antes de marcar.");
      }
      // Inativar a categoria de tarifas tira a marca: o "Criar tarifa" passa a pedir a categoria.
      const dados = { ...input, ...(!ativa && antes.tarifaBancaria ? { tarifaBancaria: false } : {}) };
      const campos = camposAlterados({ nome: antes.nome, natureza: antes.natureza, grupoNome: antes.grupoNome, ativa: antes.ativa, tarifaBancaria: antes.tarifaBancaria }, dados);
      if (campos.length === 0) return paraCategoria(antes);
      if (campos.includes("grupoNome") && (await this.nomesDoGrupo(tx, antes.companyId, antes.codigo, id)).length > 0) {
        // Renomear o grupo inteiro ainda não entra (decisão do Coordenador, 24/11/2026).
        const problema = `O nome do grupo vale para todas as categorias do ${prefixoDoGrupo(antes.codigo)}; renomear o grupo inteiro ainda não está disponível.`;
        throw new RequisicaoInvalida(problema, [{ campo: "grupoNome", problema }]);
      }
      const desmarcada = dados.tarifaBancaria && !antes.tarifaBancaria ? await this.tirarAMarcaDeTarifas(tx, antes.companyId, principal) : undefined;
      const depois = await tx.categoriaFinanceira.update({ where: { id }, data: dados });
      await this.registrar(tx, "financeiro.categoria.updated", "categoria_financeira", id, depois.companyId, principal, { codigo: depois.codigo, campos });
      return { ...paraCategoria(depois), ...(desmarcada ? { desmarcada } : {}) };
    });
  }

  /**
   * Tira a marca de tarifas da categoria da empresa que a tem, antes de pôr em outra. A trava
   * por empresa enfileira duas trocas ao mesmo tempo (o índice único é a última garantia).
   */
  private async tirarAMarcaDeTarifas(tx: Prisma.TransactionClient, empresa: string, principal: AuthPrincipal): Promise<CategoriaEditada["desmarcada"]> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`categoria.tarifa.${empresa}`}))`;
    const marcada = await tx.categoriaFinanceira.findFirst({ where: { companyId: empresa, tarifaBancaria: true }, select: { id: true, codigo: true, nome: true } });
    if (!marcada) return undefined;
    await tx.categoriaFinanceira.update({ where: { id: marcada.id }, data: { tarifaBancaria: false } });
    await this.registrar(tx, "financeiro.categoria.updated", "categoria_financeira", marcada.id, empresa, principal, { codigo: marcada.codigo, campos: ["tarifaBancaria"] });
    return marcada;
  }

  async criarConta(input: CriarContaCorrente, principal: AuthPrincipal): Promise<ContaCorrente> {
    return this.prisma.comContexto(async (tx) => {
      const criada = await tx.contaCorrente.create({
        data: {
          companyId: input.empresa, nome: input.nome, banco: input.banco ?? null, agencia: input.agencia ?? null, numero: input.numero ?? null,
          ...saldoInicialParaOBanco(input),
        },
      });
      // Sem o valor do saldo no evento: só se foi informado.
      await this.registrar(tx, "financeiro.conta_corrente.created", "conta_corrente", criada.id, criada.companyId, principal, { saldoInicial: criada.saldoInicial !== null });
      return paraConta(criada);
    });
  }

  async editarConta(id: string, input: EditarContaCorrente, principal: AuthPrincipal): Promise<ContaCorrente> {
    return this.prisma.comContexto(async (tx) => {
      const antes = await tx.contaCorrente.findUnique({ where: { id } });
      if (!antes) throw new NaoEncontrado("Conta corrente não encontrada.");
      // Comparado no formato do contrato: o saldo como string de 2 casas, o dia como AAAA-MM-DD.
      const atual = paraConta(antes);
      const campos = camposAlterados(
        { nome: atual.nome, banco: atual.banco, agencia: atual.agencia, numero: atual.numero, ativa: atual.ativa, saldoInicial: atual.saldoInicial ?? null, saldoInicialEm: atual.saldoInicialEm ?? null },
        { ...input, ...(typeof input.saldoInicial === "string" ? { saldoInicial: new Prisma.Decimal(input.saldoInicial).toFixed(2) } : {}) },
      );
      if (campos.length === 0) return atual;
      const { saldoInicial, saldoInicialEm, ...resto } = input;
      const depois = await tx.contaCorrente.update({ where: { id }, data: { ...resto, ...saldoInicialParaOBanco({ saldoInicial, saldoInicialEm }) } });
      await this.registrar(tx, "financeiro.conta_corrente.updated", "conta_corrente", id, depois.companyId, principal, { campos });
      return paraConta(depois);
    });
  }

  /** Os nomes do grupo do código na empresa, fora a própria categoria. */
  private async nomesDoGrupo(tx: Prisma.TransactionClient, empresa: string, codigo: string, exceto?: string): Promise<string[]> {
    const outras = await tx.categoriaFinanceira.findMany({
      where: { companyId: empresa, codigo: { startsWith: `${prefixoDoGrupo(codigo)}.` }, ...(exceto ? { id: { not: exceto } } : {}) },
      select: { grupoNome: true },
      distinct: ["grupoNome"],
      orderBy: { grupoNome: "asc" },
    });
    return outras.map((c) => c.grupoNome);
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: NomeDeEventoDoCatalogo,
    entityType: string,
    entityId: string,
    companyId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
