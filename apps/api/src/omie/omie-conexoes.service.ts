import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  companyKeys,
  type CompanyKey,
  type ConexaoOmieDaEmpresa,
  type EmpresaDoOmie,
  type EntradaDoOmie,
  type EstadoDasConexoesOmie,
} from "@plugga/shared";

import { EstadoInvalido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { chaveMestraConfigurada, cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository, type SegredoGuardado } from "../llm/segredo.repository.js";
import { CHAVE_OMIE } from "./omie-cofre.service";
import { situacaoDaConexao } from "./omie-conexoes.rules";
import { OmiePort, type CredenciaisDoOmie } from "./omie.port";
import { PrismaOmieConexoesRepository, empresasDoTeste, type LinhaDaConexao } from "./prisma-omie-conexoes.repository";

/** Uma linha cifrada no cofre por empresa: `integracao.omie.<empresa>`. */
export const chaveDoOmie = (empresa: CompanyKey): string => `integracao.omie.${empresa}`;

/** Leitura do par CONFERIDO de uma empresa, para quem usa a conta (`config_omie(p_empresa)`). */
export abstract class OmieLeituraPorEmpresa {
  abstract lerCifrado(empresa: CompanyKey): Promise<{ valorCifrado: string; iv: string; tag: string } | null>;
}

const abrir = (linha: Pick<SegredoGuardado, "valorCifrado" | "iv" | "tag">): CredenciaisDoOmie => {
  const d = JSON.parse(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag })) as Partial<CredenciaisDoOmie>;
  if (!d.appKey || !d.appSecret) throw new Error("conteúdo do segredo incompleto");
  return { appKey: d.appKey, appSecret: d.appSecret };
};

/**
 * O OMIE por empresa (PLU-342, D1 e D6). Gravar o par deixa a conexão "a testar";
 * o teste chama o ListarEmpresas e confere o CNPJ; sem CNPJ no cadastro, alguém
 * confirma na tela. Só o par conferido é usado (`credenciais`). A conta única de
 * antes é movida para a Plugga a pedido e apagada quando a Plugga fica conectada.
 */
@Injectable()
export class OmieConexoesService {
  private readonly logger = new Logger(OmieConexoesService.name);
  private readonly cache = new Map<CompanyKey, { valor: CredenciaisDoOmie | null; expiraEm: number }>();
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(PrismaOmieConexoesRepository) private readonly conexoes: PrismaOmieConexoesRepository,
    @Inject(OmieLeituraPorEmpresa) private readonly leitura: OmieLeituraPorEmpresa,
    @Inject(OmiePort) private readonly omie: OmiePort,
  ) {}

  /** O par conferido da empresa, para o envio e a leitura. Nunca vai para resposta de rota. */
  async credenciais(empresa: CompanyKey): Promise<CredenciaisDoOmie | null> {
    const agora = Date.now();
    const guardado = this.cache.get(empresa);
    if (guardado && guardado.expiraEm > agora) return guardado.valor;
    let valor: CredenciaisDoOmie | null = null;
    try {
      const linha = await this.leitura.lerCifrado(empresa);
      if (linha) valor = abrir(linha);
    } catch (erro) {
      this.logger.error(`par do OMIE (${empresa}) guardado não pôde ser lido: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    this.cache.set(empresa, { valor, expiraEm: agora + OmieConexoesService.VALIDADE_MS });
    return valor;
  }

  async estado(): Promise<EstadoDasConexoesOmie> {
    const [linhas, cnpjs, antiga, ...pares] = await Promise.all([
      this.conexoes.linhas(),
      this.conexoes.cnpjsDoCadastro(),
      this.segredos.buscar(CHAVE_OMIE),
      ...companyKeys.map((empresa) => this.segredos.buscar(chaveDoOmie(empresa))),
    ]);
    return {
      conexoes: companyKeys.map((empresa, i) => this.conexao(empresa, pares[i] ?? null, linhas.get(empresa) ?? null, cnpjs.get(empresa) ?? null)),
      contaAntiga: antiga ? { mascara: `••••${antiga.ultimosQuatro}`, atualizadoEm: antiga.atualizadoEm.toISOString() } : null,
      cofreConfigurado: chaveMestraConfigurada(),
    };
  }

  async gravar(empresa: CompanyKey, entrada: EntradaDoOmie, principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    const troca = (await this.segredos.buscar(chaveDoOmie(empresa))) !== null;
    await this.guardarPar(empresa, entrada, principal, troca);
    return this.estado();
  }

  async apagar(empresa: CompanyKey, principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    await this.segredos.apagar(chaveDoOmie(empresa));
    this.cache.delete(empresa);
    await this.conexoes.registrarDesconexao(empresa, principal);
    return this.estado();
  }

  /** Chama o OMIE com o par da empresa. Só a pedido de quem está na tela. */
  async testar(empresa: CompanyKey, principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    const par = await this.segredos.buscar(chaveDoOmie(empresa));
    if (!par) throw new EstadoInvalido("Grave a chave e o segredo da empresa antes de testar.");
    const empresas = await this.omie.listarEmpresas(abrir(par));
    await this.registrarTeste(empresa, par.atualizadoEm, empresas, principal);
    return this.estado();
  }

  /** "É esta a empresa?": o CNPJ que a pessoa viu tem de ser o que o teste trouxe, no mesmo par. */
  async confirmar(empresa: CompanyKey, cnpj: string, principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    const atual = (await this.estado()).conexoes.find((c) => c.empresa === empresa)!;
    if (atual.situacao !== "a_confirmar") throw new EstadoInvalido("Só se confirma a conexão testada que espera confirmação.");
    const linha = (await this.conexoes.linhas()).get(empresa);
    if (!linha?.ultimoTesteEm) throw new EstadoInvalido("Teste a conexão antes de confirmar.");
    const resultado = await this.conexoes.confirmar(empresa, { versao: linha.segredoAtualizadoEm, testeEm: linha.ultimoTesteEm, cnpj }, principal, new Date());
    this.cache.delete(empresa);
    if (resultado.tipo === "bloqueada") throw new EstadoInvalido("Este CNPJ é o da outra empresa: a conexão ficou bloqueada. Confira o par.");
    await this.substituirContaAntiga(empresa);
    return this.estado();
  }

  /** A conta única de antes vira o par da Plugga, testado com as mesmas regras. */
  async moverContaAntiga(principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    const antiga = await this.segredos.buscar(CHAVE_OMIE);
    if (!antiga) throw new EstadoInvalido("Não há conta antiga do OMIE para mover.");
    const credenciais = abrir(antiga);
    // Testa antes de gravar: um par que não confere não substitui o da Plugga.
    const empresas = await this.omie.listarEmpresas(credenciais);
    const troca = (await this.segredos.buscar(chaveDoOmie("plugga"))) !== null;
    const versao = await this.guardarPar("plugga", credenciais, principal, troca);
    await this.registrarTeste("plugga", versao, empresas, principal);
    // O teste já apaga a antiga quando a Plugga fica conectada.
    const apagada = (await this.segredos.buscar(CHAVE_OMIE)) === null;
    await this.conexoes.registrarContaAntigaMovida(principal, apagada);
    return this.estado();
  }

  async definirCnpj(empresa: CompanyKey, cnpj: string | null, principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    await this.conexoes.definirCnpj(empresa, cnpj, principal);
    // O cadastro novo pode ter bloqueado uma conexão: o uso relê já.
    this.cache.clear();
    return this.estado();
  }

  // ------------------------------------------------------------------ apoio

  private async guardarPar(empresa: CompanyKey, par: CredenciaisDoOmie, principal: AuthPrincipal, troca: boolean): Promise<Date> {
    const cifrada = cifrar(JSON.stringify({ appKey: par.appKey, appSecret: par.appSecret } satisfies CredenciaisDoOmie));
    await this.segredos.gravar({
      chave: chaveDoOmie(empresa),
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: par.appKey.slice(-4),
      atualizadoPor: principal.id,
    });
    this.cache.delete(empresa);
    const gravado = await this.segredos.buscar(chaveDoOmie(empresa));
    if (!gravado) throw new Error("par do OMIE não ficou gravado");
    await this.conexoes.reiniciar(empresa, gravado.atualizadoEm, principal, troca);
    return gravado.atualizadoEm;
  }

  private async registrarTeste(empresa: CompanyKey, versao: Date, empresas: EmpresaDoOmie[], principal: AuthPrincipal): Promise<void> {
    const resultado = await this.conexoes.registrarTeste(empresa, versao, empresas, principal, new Date());
    this.cache.delete(empresa);
    if (resultado.tipo === "conectada") await this.substituirContaAntiga(empresa);
  }

  /** A Plugga conectada substitui a conta única de antes. Devolve se apagou. */
  private async substituirContaAntiga(empresa: CompanyKey): Promise<boolean> {
    if (empresa !== "plugga" || !(await this.credenciais("plugga"))) return false;
    if (!(await this.segredos.buscar(CHAVE_OMIE))) return false;
    await this.segredos.apagar(CHAVE_OMIE);
    return true;
  }

  private conexao(empresa: CompanyKey, par: SegredoGuardado | null, linha: LinhaDaConexao | null, cnpjDoCadastro: string | null): ConexaoOmieDaEmpresa {
    let ilegivel = false;
    if (par) {
      try {
        abrir(par);
      } catch {
        ilegivel = true;
      }
    }
    const situacao = situacaoDaConexao({
      segredoAtualizadoEm: par?.atualizadoEm ?? null,
      ilegivel,
      conexao: linha ? { segredoAtualizadoEm: linha.segredoAtualizadoEm, ultimoTesteEm: linha.ultimoTesteEm, bloqueio: linha.bloqueio as ConexaoOmieDaEmpresa["bloqueio"], confirmadaEm: linha.confirmadaEm } : null,
    });
    // Teste e confirmação de um par anterior não aparecem como se fossem deste.
    const valeParaOPar = situacao !== "nao_conectada" && situacao !== "a_testar" && situacao !== "ilegivel";
    return {
      empresa,
      situacao,
      bloqueio: situacao === "bloqueada" ? (linha?.bloqueio as ConexaoOmieDaEmpresa["bloqueio"]) : null,
      mascara: par ? `••••${par.ultimosQuatro}` : null,
      cnpjDoCadastro,
      ultimoTeste: valeParaOPar && linha?.ultimoTesteEm
        ? { em: linha.ultimoTesteEm.toISOString(), por: linha.ultimoTestePor?.name ?? null, ...empresasDoTeste(linha.ultimoTeste) }
        : null,
      confirmada: situacao === "conectada" && linha?.confirmadaEm && linha.cnpjConfirmado
        ? { em: linha.confirmadaEm.toISOString(), por: linha.confirmadaPor?.name ?? null, cnpj: linha.cnpjConfirmado, razaoSocial: linha.razaoSocialConfirmada }
        : null,
      atualizadoEm: par?.atualizadoEm.toISOString() ?? null,
      atualizadoPor: par?.atualizadoPor ?? null,
    };
  }
}
