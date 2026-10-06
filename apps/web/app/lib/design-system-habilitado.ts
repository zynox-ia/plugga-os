/** A página de referência visual só existe fora de produção (spec 002, T205). */
export function designSystemHabilitado(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
