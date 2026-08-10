import { z } from "zod";

import type { RoleKey } from "./auth.js";

/**
 * Permissão por ação, complementar ao papel (`RoleKey`). Um `@Roles(...)`
 * decide o que a pessoa **é**; uma permissão decide o que ela **pode fazer**
 * dentro disso — o `PermissionsGuard` roda ao lado do `RolesGuard` existente,
 * não no lugar dele.
 *
 * Onde já existe um controller com `@Roles(...CONSTANTE)`, o mapeamento
 * abaixo replica exatamente essa constante — não inventa regra nova, só a
 * torna nomeável por ação em vez de só por rota. Onde não existe controller
 * ainda (`obra.*`, além de `compra.*` e `financeiro.*`, que seguem o
 * POP-COMP-001/POP-OBR-001), o mapeamento segue a matriz de permissões do POP
 * correspondente.
 */
export const permissionKeys = [
  "usuarios.criar",
  "usuarios.editar",
  "usuarios.remover",
  "proposta.criar",
  "proposta.editar",
  "proposta.aprovar",
  "proposta.enviar_cliente",
  "estudo.gerar",
  "estudo.aprovar",
  "obra.criar",
  "obra.editar",
  "obra.aprovar_etapa",
  "obra.encerrar",
  "documento.anexar",
  "documento.aprovar",
  "documento.excluir",
  "financeiro.ver",
  "financeiro.editar",
  "financeiro.aprovar",
  "compra.solicitar",
  "compra.cotar",
  "compra.aprovar",
  "relatorio.ver",
  "relatorio.exportar",
  "configuracao.editar",
] as const;

export const permissionKeySchema = z.enum(permissionKeys);

export type PermissionKey = z.infer<typeof permissionKeySchema>;

/**
 * `documento.excluir` é `[]` de propósito: o POP-OBR-001 §5.1 e o POP-COMP-001
 * (cotação sem delete) são explícitos — ninguém apaga evidência/documento,
 * nem `admin`. Uma permissão sem papel nenhum é a forma de expressar "não
 * autorizado a ninguém" sem uma exceção especial no guard.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  admin: [
    "usuarios.criar",
    "usuarios.editar",
    "usuarios.remover",
    "relatorio.ver",
    "relatorio.exportar",
    "configuracao.editar",
  ],
  diretoria: [
    "usuarios.criar",
    "usuarios.editar",
    "usuarios.remover",
    "proposta.aprovar",
    "estudo.aprovar",
    "obra.criar",
    "obra.editar",
    "obra.aprovar_etapa",
    "obra.encerrar",
    "documento.aprovar",
    "financeiro.ver",
    "financeiro.editar",
    "financeiro.aprovar",
    "compra.aprovar",
    "relatorio.ver",
    "relatorio.exportar",
    "configuracao.editar",
  ],
  comercial: ["proposta.criar", "proposta.editar", "proposta.enviar_cliente", "relatorio.ver"],
  pluggamob: ["relatorio.ver"],
  financeiro: [
    "financeiro.ver",
    "financeiro.editar",
    "financeiro.aprovar",
    "compra.aprovar",
    "relatorio.ver",
  ],
  compras: ["compra.solicitar", "compra.cotar", "relatorio.ver"],
  opm: ["estudo.gerar", "relatorio.ver"],
  tech: ["usuarios.criar", "usuarios.editar", "estudo.gerar", "estudo.aprovar", "relatorio.ver"],
  viewer: ["relatorio.ver"],
  // POP-OBR-001 §5, matriz de permissões por etapa.
  projetista: ["obra.editar", "documento.anexar"],
  engenheiro: [
    "obra.criar",
    "obra.editar",
    "obra.aprovar_etapa",
    "obra.encerrar",
    "documento.anexar",
    "documento.aprovar",
    "relatorio.ver",
  ],
  supervisor: ["obra.editar", "documento.anexar", "compra.solicitar", "relatorio.ver"],
  tecnico: ["documento.anexar", "compra.solicitar"],
  almoxarife: ["documento.anexar"],
  seguranca: ["documento.anexar"],
  gestor_suprimentos: ["compra.solicitar", "relatorio.ver"],
  comprador: ["compra.cotar"],
};

// Falha o build se um papel novo entrar em roleKeys sem ganhar uma entrada
// aqui — permissão ausente por esquecimento é pior que permissão vazia
// explícita, porque não avisa ninguém.
type _TodoPapelTemPermissoes = keyof typeof ROLE_PERMISSIONS extends RoleKey
  ? RoleKey extends keyof typeof ROLE_PERMISSIONS
    ? true
    : never
  : never;
const _todoPapelTemPermissoes: _TodoPapelTemPermissoes = true;
void _todoPapelTemPermissoes;

export function papeisComPermissao(permissao: PermissionKey): RoleKey[] {
  return (Object.keys(ROLE_PERMISSIONS) as RoleKey[]).filter((papel) =>
    ROLE_PERMISSIONS[papel].includes(permissao),
  );
}
