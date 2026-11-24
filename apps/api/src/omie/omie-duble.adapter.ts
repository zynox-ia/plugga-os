import { Injectable } from "@nestjs/common";
import type { EmpresaDoOmie } from "@plugga/shared";

import { OmieFalhouError, OmiePort, type CategoriaDoOmie, type ContaCorrenteDoOmie, type CredenciaisDoOmie } from "./omie.port";

/** Um plano de contas sintético, com grupos, inativa, oculta e transferência, para o espelho. */
const CATEGORIAS_SINTETICAS: CategoriaDoOmie[] = [
  { codigo: "1.01", descricao: "Receitas de serviços", grupo: null, receita: true, despesa: false, totalizadora: true, transferencia: false, ativa: true },
  { codigo: "1.01.01", descricao: "Gestão de energia", grupo: "1.01", receita: true, despesa: false, totalizadora: false, transferencia: false, ativa: true },
  { codigo: "1.01.02", descricao: "Consultoria antiga", grupo: "1.01", receita: true, despesa: false, totalizadora: false, transferencia: false, ativa: false },
  { codigo: "2.01", descricao: "Despesas operacionais", grupo: null, receita: false, despesa: true, totalizadora: true, transferencia: false, ativa: true },
  { codigo: "2.01.01", descricao: "Serviços de terceiros", grupo: "2.01", receita: false, despesa: true, totalizadora: false, transferencia: false, ativa: true },
  { codigo: "2.01.02", descricao: "Telefonia e internet", grupo: "2.01", receita: false, despesa: true, totalizadora: false, transferencia: false, ativa: true },
  { codigo: "3.01", descricao: "Transferência entre contas", grupo: null, receita: false, despesa: false, totalizadora: false, transferencia: true, ativa: true },
];

const CONTAS_SINTETICAS: ContaCorrenteDoOmie[] = [
  { codigo: "9999001", descricao: "Conta sintética principal", banco: "999", agencia: "9999", numero: "99990-1", ativa: true },
  { codigo: "9999002", descricao: "Conta sintética encerrada", banco: "999", agencia: "9999", numero: "99990-2", ativa: false },
];

/** CNPJ da faixa sintética do projeto (scripts/dados-sinteticos.mjs), quando a chave não traz um. */
const CNPJ_SINTETICO = "99999001000159";

/**
 * O OMIE de mentira, para a integração em `mock` (o padrão): nunca sai para a rede.
 * Chave começando com `sintetico-` vale como uma empresa sintética; com
 * `sintetico-<14 dígitos>`, aquele CNPJ (para testar o bloqueio e a confirmação).
 * Qualquer outra chave responde que o OMIE não foi chamado.
 */
@Injectable()
export class OmieDubleAdapter extends OmiePort {
  async consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie> {
    const [empresa] = await this.listarEmpresas(credenciais);
    return empresa!;
  }

  async listarEmpresas(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie[]> {
    const m = /^sintetico-(\d{14})?/.exec(credenciais.appKey);
    if (!m) throw new OmieFalhouError("modo_mock");
    const cnpj = m[1] ?? CNPJ_SINTETICO;
    return [{ razaoSocial: `EMPRESA SINTÉTICA ${cnpj.slice(0, 5)}`, nomeFantasia: "Sintética (modo mock)", cnpj }];
  }

  async listarCategorias(credenciais: CredenciaisDoOmie): Promise<CategoriaDoOmie[]> {
    this.exigirSintetica(credenciais);
    return CATEGORIAS_SINTETICAS.map((c) => ({ ...c }));
  }

  async listarContasCorrentes(credenciais: CredenciaisDoOmie): Promise<ContaCorrenteDoOmie[]> {
    this.exigirSintetica(credenciais);
    return CONTAS_SINTETICAS.map((c) => ({ ...c }));
  }

  private exigirSintetica(credenciais: CredenciaisDoOmie): void {
    if (!credenciais.appKey.startsWith("sintetico-")) throw new OmieFalhouError("modo_mock");
  }
}
