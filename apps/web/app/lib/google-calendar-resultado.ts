/**
 * Como o retorno do consentimento do Google volta para a tela: um código de uma
 * lista fechada na URL (`?google=conectado`) e o texto que a tela mostra para
 * ele. Nada que o Google ou a API disseram vai para o endereço, para ele não
 * servir de canal de texto forjado.
 */

export const DESTINO_DAS_INTEGRACOES = "/configuracoes?aba=integracoes";

export type ResultadoDaConexao = "conectado" | "negado" | "invalido" | "indisponivel" | "erro";

export const RESULTADOS_DA_CONEXAO: readonly ResultadoDaConexao[] = ["conectado", "negado", "invalido", "indisponivel", "erro"];

export const MENSAGEM_DO_RESULTADO: Record<ResultadoDaConexao, { tom: "success" | "warning" | "danger"; texto: string }> = {
  conectado: { tom: "success", texto: "Google Calendar conectado." },
  negado: { tom: "warning", texto: "O acesso à agenda não foi autorizado. Nada foi conectado." },
  invalido: { tom: "warning", texto: "O pedido de conexão expirou ou não é válido. Conecte de novo." },
  indisponivel: { tom: "danger", texto: "Não foi possível falar com o Google agora. Tente de novo em instantes." },
  erro: { tom: "danger", texto: "Não foi possível concluir a conexão com o Google." },
};

export function resultadoDaUrl(valor: string | null): ResultadoDaConexao | null {
  return RESULTADOS_DA_CONEXAO.find((resultado) => resultado === valor) ?? null;
}
