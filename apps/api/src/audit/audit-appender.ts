import { Injectable } from "@nestjs/common";
import type { ActorType, Prisma } from "@prisma/client";
import { eventoEstaNoCatalogo, type NomeDeEventoAuditavel } from "@plugga/shared";

export interface EventoParaRegistro {
  eventName: NomeDeEventoAuditavel;
  entityType: string;
  entityId: string;
  actorType: ActorType;
  actorId: string | null;
  /** Só identificadores e nomes de campos. Nunca valor pessoal. */
  payload: Record<string, unknown>;
  occurredAt?: Date;
  /**
   * Empresa do evento. Só é gravada depois da migração que cria `company_id`
   * em `event_log` (T071); até lá o campo é aceito e omitido.
   */
  companyId?: string;
}

export class PayloadDeAuditoriaInvalido extends Error {
  constructor(motivo: string) {
    super(`payload de auditoria inválido: ${motivo}`);
    this.name = "PayloadDeAuditoriaInvalido";
  }
}

const CHAVES_PROIBIDAS = new Set([
  "nome",
  "name",
  "email",
  "telefone",
  "celular",
  "documento",
  "cnpj",
  "cpf",
  "endereco",
  "address",
]);
const FRAGMENTOS_PROIBIDOS = ["email", "telefone", "cnpj", "cpf", "documento", "endereco"];

const PADRAO_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PADRAO_CNPJ_FORMATADO = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const PADRAO_CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

function normalizarChave(chave: string): string {
  return chave
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function digitoVerificadorValido(digitos: string, pesos: number[]): boolean {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  const esperado = resto < 2 ? 0 : 11 - resto;
  return esperado === Number(digitos[pesos.length]);
}

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  return (
    digitoVerificadorValido(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) &&
    digitoVerificadorValido(d.slice(0, 10) + d[10], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  );
}

function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  return (
    digitoVerificadorValido(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) &&
    digitoVerificadorValido(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  );
}

function valorSuspeito(valor: string): string | null {
  if (PADRAO_EMAIL.test(valor)) return "valor com formato de e-mail";
  if (PADRAO_CNPJ_FORMATADO.test(valor) || PADRAO_CPF_FORMATADO.test(valor)) {
    return "valor com formato de documento";
  }
  const somenteDigitos = valor.replace(/\D/g, "");
  if (/^\d+$/.test(valor.trim()) && (cpfValido(somenteDigitos) || cnpjValido(somenteDigitos))) {
    return "valor com formato de documento";
  }
  return null;
}

/** Percorre o payload e devolve o primeiro motivo de rejeição, ou null. */
export function motivoDeRejeicaoDoPayload(valor: unknown, caminho = "payload"): string | null {
  if (typeof valor === "string") {
    const motivo = valorSuspeito(valor);
    return motivo ? `${motivo} em ${caminho}` : null;
  }
  if (Array.isArray(valor)) {
    for (const [i, item] of valor.entries()) {
      const motivo = motivoDeRejeicaoDoPayload(item, `${caminho}[${i}]`);
      if (motivo) return motivo;
    }
    return null;
  }
  if (valor && typeof valor === "object") {
    for (const [chave, item] of Object.entries(valor)) {
      const normal = normalizarChave(chave);
      if (CHAVES_PROIBIDAS.has(normal) || FRAGMENTOS_PROIBIDOS.some((f) => normal.includes(f))) {
        return `chave proibida "${chave}" em ${caminho}`;
      }
      const motivo = motivoDeRejeicaoDoPayload(item, `${caminho}.${chave}`);
      if (motivo) return motivo;
    }
  }
  return null;
}

/**
 * Único ponto de gravação do `event_log` (contrato catalogo-eventos.md):
 * evento do catálogo, dentro de transação, com payload sem dado pessoal.
 */
@Injectable()
export class AuditAppender {
  async append(tx: Prisma.TransactionClient, evento: EventoParaRegistro): Promise<void> {
    if (!tx || typeof tx.eventLog?.create !== "function") {
      throw new PayloadDeAuditoriaInvalido("o registro exige uma transação (tx)");
    }
    if (!eventoEstaNoCatalogo(evento.eventName)) {
      throw new PayloadDeAuditoriaInvalido(`evento "${evento.eventName}" fora do catálogo`);
    }
    const motivo = motivoDeRejeicaoDoPayload(evento.payload);
    if (motivo) {
      throw new PayloadDeAuditoriaInvalido(motivo);
    }
    await tx.eventLog.create({
      data: {
        eventName: evento.eventName,
        entityType: evento.entityType,
        entityId: evento.entityId,
        actorType: evento.actorType,
        actorId: evento.actorId,
        payload: evento.payload as Prisma.InputJsonObject,
        occurredAt: evento.occurredAt ?? new Date(),
      },
      select: { id: true },
    });
  }
}
