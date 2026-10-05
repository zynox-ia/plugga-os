import { randomBytes } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const ALFABETO_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48 bits de tempo em milissegundos + 80 bits aleatórios, em Crockford base32 (26 caracteres). */
export function gerarRequestId(agora: number = Date.now()): string {
  let tempo = "";
  let restante = agora;
  for (let i = 0; i < 10; i += 1) {
    tempo = ALFABETO_CROCKFORD[restante % 32] + tempo;
    restante = Math.floor(restante / 32);
  }
  const aleatorio = randomBytes(16);
  let sufixo = "";
  for (let i = 0; i < 16; i += 1) {
    sufixo += ALFABETO_CROCKFORD[aleatorio[i]! % 32];
  }
  return tempo + sufixo;
}

export interface RequisicaoComId extends Request {
  requestId?: string;
}

/**
 * Gera o identificador da requisição, devolve em `x-request-id` e o deixa em
 * `req.requestId` para o log e o envelope de erro. Um valor vindo do cliente
 * nunca é aproveitado: o identificador é confiável porque é nosso.
 */
export function requestIdMiddleware(req: RequisicaoComId, res: Response, next: NextFunction): void {
  const id = gerarRequestId();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
