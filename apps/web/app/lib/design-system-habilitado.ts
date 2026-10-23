/** A página de referência visual só existe fora de produção. */
export function designSystemHabilitado(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
