/** Remove caracteres de controle (0x00–0x1F, 0x7F) sem usar regex com eles literalmente. */
function semCaracteresDeControle(valor: string): string {
  return Array.from(valor)
    .filter((c) => {
      const codigo = c.codePointAt(0) ?? 0;
      return codigo > 0x1f && codigo !== 0x7f;
    })
    .join("");
}

/**
 * Nome seguro para a chave do armazenamento: sem separador de caminho, sem
 * caractere de controle, só o necessário para identificar o arquivo depois.
 * O nome original (o que a pessoa enviou) continua guardado à parte, para a
 * tela mostrar; este só entra na chave do objeto.
 */
export function nomeSeguro(nomeOriginal: string): string {
  const semCaminho = nomeOriginal.split(/[/\\]/).pop() ?? nomeOriginal;
  const semControle = semCaracteresDeControle(semCaminho.normalize("NFKC"));
  const seguro = semControle
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 150);
  return seguro || "arquivo";
}

/**
 * Cabeçalho `Content-Disposition` com o nome original, mesmo com acento ou
 * aspas: a forma `filename*` (RFC 6266) carrega o nome real; `filename` é só
 * um substituto em ASCII, para o navegador que não entende a extensão.
 */
export function cabecalhoDisposicao(tipo: "attachment" | "inline", nomeOriginal: string): string {
  const semControle = semCaracteresDeControle(nomeOriginal).replace(/"/g, "");
  const fallback = (semControle.replace(/[^\x20-\x7e]/g, "_") || "arquivo").slice(0, 150);
  const codificado = encodeURIComponent(semControle || "arquivo");
  return `${tipo}; filename="${fallback}"; filename*=UTF-8''${codificado}`;
}
