import { companyKeys, departmentIdsByCompany, isDepartmentOfCompany, type CompanyKey } from "@plugga/shared";

/**
 * Em qual balde cada arquivo mora.
 *
 * Um balde por par (empresa, departamento), com o nome `{empresa}-{departamento}`.
 * Os identificadores vêm de `@plugga/shared`, a mesma fonte dos acessos por
 * departamento: o armazenamento acompanha o desenho de telas em vez de manter
 * uma segunda organização que precisaria ser atualizada junto.
 *
 * `financeiro` existe nas duas empresas de propósito, e cada uma tem o seu
 * balde. Uma empresa nunca lê o balde da outra.
 *
 * O balde não vem mais de variável de ambiente. Uma variável única fazia todo
 * arquivo, de qualquer empresa e departamento, cair no mesmo lugar.
 */

/** Baldes que não pertencem a nenhum departamento. */
export const BALDES_DE_SISTEMA = {
  /** Cópias do banco. Tem credencial e retenção próprias. */
  backups: "plugga-backups",
  /** Material de teste das distribuidoras; nunca mistura com fatura de cliente. */
  corpus: "plugga-corpus-faturas",
} as const;

/**
 * Nome do balde do departamento. Recusa par que o cadastro não reconhece: um
 * departamento que a empresa não tem produziria um balde que ninguém provisiona,
 * e o erro só apareceria como falha de upload.
 */
export function baldeDe(empresa: CompanyKey, departamento: string): string {
  if (!(companyKeys as readonly string[]).includes(empresa)) {
    throw new Error(`empresa desconhecida: "${String(empresa)}"`);
  }
  if (!isDepartmentOfCompany(empresa, departamento)) {
    throw new Error(`a empresa "${empresa}" não tem o departamento "${departamento}"`);
  }
  return `${empresa}-${departamento}`;
}

/** Todos os baldes de negócio, um por par empresa/departamento do cadastro. */
export function baldesDeNegocio(): readonly string[] {
  return companyKeys.flatMap((empresa) =>
    departmentIdsByCompany[empresa].map((departamento) => baldeDe(empresa, departamento)),
  );
}
