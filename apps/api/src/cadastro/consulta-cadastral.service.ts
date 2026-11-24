import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { eventNames, type EmpresaConsultada, type EnderecoConsultado, type EstadoDaConsultaCadastral, type EventName } from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { cepValido, cnpjValido, somenteDigitos } from "./documentos";
import { ConsultaCadastralPort, FonteIndisponivelError } from "./consulta-cadastral.port";

/** Uma linha no cofre = integração ligada. Chave lógica `integracao.<id>`. */
export const CHAVE_CADASTRO = "integracao.cadastro";
export const FONTE = "BrasilAPI";

/**
 * Leitura do liga/desliga por quem consulta. É abstração porque quem consulta é
 * qualquer pessoa logada, que não alcança a tabela do cofre: o banco responde só
 * "ligada ou não" por uma função (`plugga_security.integracao_ativa`).
 */
export abstract class IntegracaoAtivaRepository {
  abstract ativa(id: string): Promise<boolean>;
}

type Guardado<T> = { valor: T; expiraEm: number };

/**
 * Consulta de CNPJ e CEP em fonte pública, atrás de um liga/desliga da
 * plataforma. É a única porta de entrada: telas, jobs e agentes chamam o serviço
 * e nunca a fonte, para o desligamento valer em todo lugar de uma vez.
 */
@Injectable()
export class ConsultaCadastralService {
  private readonly logger = new Logger(ConsultaCadastralService.name);
  /** Curto de propósito: ligar ou desligar pela tela tem de valer quase na hora. */
  private static readonly VALIDADE_ATIVA_MS = 5_000;
  /** Dado cadastral muda devagar; evita bater na fonte (que tem limite de taxa) a cada digitação. */
  private static readonly VALIDADE_RESULTADO_MS = 10 * 60_000;
  private static readonly LIMITE_DO_CACHE = 500;

  private ativaCache: Guardado<boolean> | null = null;
  private readonly resultados = new Map<string, Guardado<EmpresaConsultada | EnderecoConsultado>>();

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(IntegracaoAtivaRepository) private readonly ativaRepositorio: IntegracaoAtivaRepository,
    @Inject(ConsultaCadastralPort) private readonly fonte: ConsultaCadastralPort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  /** Para a tela do desenvolvedor: lê a linha do cofre (só ele alcança a tabela). */
  async estado(): Promise<EstadoDaConsultaCadastral> {
    const linha = await this.segredos.buscar(CHAVE_CADASTRO);
    return {
      ativa: linha !== null,
      fonte: FONTE,
      atualizadoEm: linha ? linha.atualizadoEm.toISOString() : null,
      atualizadoPor: linha ? linha.atualizadoPor : null,
    };
  }

  async definir(ativa: boolean, quem: string): Promise<EstadoDaConsultaCadastral> {
    if (ativa) {
      const cifrada = cifrar(JSON.stringify({ ativa: true }));
      await this.segredos.gravar({
        chave: CHAVE_CADASTRO,
        valorCifrado: cifrada.conteudo,
        iv: cifrada.iv,
        tag: cifrada.tag,
        ultimosQuatro: "",
        atualizadoPor: quem,
      });
    } else {
      await this.segredos.apagar(CHAVE_CADASTRO);
    }
    this.ativaCache = null;
    this.resultados.clear();
    await this.registrar(ativa ? eventNames.integracaoCadastroAtivada : eventNames.integracaoCadastroDesativada, quem);
    return this.estado();
  }

  async empresa(cnpjTexto: string): Promise<EmpresaConsultada> {
    const cnpj = somenteDigitos(cnpjTexto);
    if (!cnpjValido(cnpj)) throw new BadRequestException("CNPJ inválido: confira os 14 dígitos.");
    const empresa = await this.consultar(`cnpj:${cnpj}`, () => this.fonte.consultarCnpj(cnpj));
    if (!empresa) throw new NotFoundException("CNPJ não encontrado na fonte de consulta.");
    return empresa as EmpresaConsultada;
  }

  async endereco(cepTexto: string): Promise<EnderecoConsultado> {
    const cep = somenteDigitos(cepTexto);
    if (!cepValido(cep)) throw new BadRequestException("CEP inválido: informe os 8 dígitos.");
    const endereco = await this.consultar(`cep:${cep}`, () => this.fonte.consultarCep(cep));
    if (!endereco) throw new NotFoundException("CEP não encontrado na fonte de consulta.");
    return endereco as EnderecoConsultado;
  }

  private async consultar<T extends EmpresaConsultada | EnderecoConsultado>(
    chave: string,
    buscar: () => Promise<T | null>,
  ): Promise<T | null> {
    if (!(await this.estaAtiva())) {
      throw new ConflictException("A consulta de CNPJ e CEP está desativada. Peça a um desenvolvedor para ligá-la em Configurações → Integrações.");
    }

    const agora = Date.now();
    const guardado = this.resultados.get(chave);
    if (guardado && guardado.expiraEm > agora) return guardado.valor as T;

    let resultado: T | null;
    try {
      resultado = await buscar();
    } catch (erro) {
      if (erro instanceof FonteIndisponivelError) {
        this.logger.warn(`consulta cadastral indisponível: ${erro.message}`);
        throw new BadGatewayException("A fonte de consulta não respondeu. Tente de novo em instantes.");
      }
      throw erro;
    }

    // "Não existe" não entra no cache: o dado pode passar a existir, e erro nunca vira resposta guardada.
    if (resultado) {
      if (this.resultados.size >= ConsultaCadastralService.LIMITE_DO_CACHE) this.resultados.clear();
      this.resultados.set(chave, { valor: resultado, expiraEm: agora + ConsultaCadastralService.VALIDADE_RESULTADO_MS });
    }
    return resultado;
  }

  private async estaAtiva(): Promise<boolean> {
    const agora = Date.now();
    if (this.ativaCache && this.ativaCache.expiraEm > agora) return this.ativaCache.valor;
    const valor = await this.ativaRepositorio.ativa("cadastro");
    this.ativaCache = { valor, expiraEm: agora + ConsultaCadastralService.VALIDADE_ATIVA_MS };
    return valor;
  }

  private async registrar(evento: EventName, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: CHAVE_CADASTRO,
        actorType: "user",
        actorId: quem,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`alteração da consulta cadastral não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}
