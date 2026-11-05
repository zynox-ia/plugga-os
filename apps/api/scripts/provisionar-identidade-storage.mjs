import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sha256hex(dado) {
  return createHash("sha256").update(dado).digest("hex");
}

function hmac(chave, dado) {
  return createHmac("sha256", chave).update(dado).digest();
}

// Assinatura SigV4 à mão: a API administrativa do RustFS (/rustfs/admin/v3/*)
// assina com o mesmo esquema do S3 (service "s3"), mas não é uma operação S3
// que o @aws-sdk/client-s3 conheça. Sem dependência nova: o algoritmo é curto
// e estável (AWS SigV4), e evita prender o provisionamento a um pacote extra.
export function assinaRequisicao({ metodo, caminho, query = "", corpo = "", host, accessKey, secretKey, regiao = "us-east-1" }) {
  const agora = new Date();
  const dataAmz = agora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dataCurta = dataAmz.slice(0, 8);
  const hashCorpo = sha256hex(corpo);
  const cabecalhos = { host, "x-amz-date": dataAmz, "x-amz-content-sha256": hashCorpo };
  const chavesOrdenadas = Object.keys(cabecalhos).sort();
  const cabecalhosCanonicos = chavesOrdenadas.map((k) => `${k}:${String(cabecalhos[k]).trim()}\n`).join("");
  const cabecalhosAssinados = chavesOrdenadas.join(";");
  const requisicaoCanonica = [metodo, caminho, query, cabecalhosCanonicos, cabecalhosAssinados, hashCorpo].join("\n");
  const escopoCredencial = `${dataCurta}/${regiao}/s3/aws4_request`;
  const paraAssinar = ["AWS4-HMAC-SHA256", dataAmz, escopoCredencial, sha256hex(requisicaoCanonica)].join("\n");
  const kData = hmac(`AWS4${secretKey}`, dataCurta);
  const kRegiao = hmac(kData, regiao);
  const kServico = hmac(kRegiao, "s3");
  const kAssinatura = hmac(kServico, "aws4_request");
  const assinatura = hmac(kAssinatura, paraAssinar).toString("hex");
  const autorizacao = `AWS4-HMAC-SHA256 Credential=${accessKey}/${escopoCredencial}, SignedHeaders=${cabecalhosAssinados}, Signature=${assinatura}`;
  return { ...cabecalhos, Authorization: autorizacao };
}

export function chamarAdmin(endpoint, { metodo, caminho, query = "", corpo = "" }, { accessKey, secretKey }) {
  const url = new URL(endpoint);
  const cliente = url.protocol === "https:" ? https : http;
  const cabecalhos = assinaRequisicao({
    metodo,
    caminho,
    query,
    corpo,
    host: url.host,
    accessKey,
    secretKey,
  });
  return new Promise((resolve, reject) => {
    const requisicao = cliente.request(
      {
        hostname: url.hostname,
        port: url.port,
        method: metodo,
        path: query ? `${caminho}?${query}` : caminho,
        headers: { ...cabecalhos, "content-length": Buffer.byteLength(corpo) },
      },
      (resposta) => {
        let dados = "";
        resposta.on("data", (pedaco) => (dados += pedaco));
        resposta.on("end", () => resolve({ status: resposta.statusCode, corpo: dados }));
      },
    );
    requisicao.on("error", reject);
    requisicao.end(corpo);
  });
}

function falhaSeNaoOk({ status, corpo }, acao) {
  if (status < 200 || status >= 300) throw new Error(`${acao} falhou (status ${status}): ${corpo}`);
}

export async function provisionarIdentidade(enviar, { accessKey, secretKey, politicaNome, politicaJson }) {
  falhaSeNaoOk(
    await enviar({
      metodo: "PUT",
      caminho: "/rustfs/admin/v3/add-canned-policy",
      query: `name=${encodeURIComponent(politicaNome)}`,
      corpo: politicaJson,
    }),
    `criar a política ${politicaNome}`,
  );
  falhaSeNaoOk(
    await enviar({
      metodo: "PUT",
      caminho: "/rustfs/admin/v3/add-user",
      query: `accessKey=${encodeURIComponent(accessKey)}`,
      corpo: JSON.stringify({ secretKey, status: "enabled" }),
    }),
    `criar o usuário ${accessKey}`,
  );
  falhaSeNaoOk(
    await enviar({
      metodo: "POST",
      caminho: "/rustfs/admin/v3/idp/builtin/policy/attach",
      corpo: JSON.stringify({ policies: [politicaNome], user: accessKey }),
    }),
    `vincular a política ${politicaNome} ao usuário ${accessKey}`,
  );
}

async function main() {
  const { STORAGE_ENDPOINT, STORAGE_ROOT_ACCESS_KEY, STORAGE_ROOT_SECRET_KEY, IDENTIDADE_ACCESS_KEY, IDENTIDADE_SECRET_KEY, IDENTIDADE_POLITICA_NOME, IDENTIDADE_POLITICA_JSON } =
    process.env;
  if (
    !STORAGE_ENDPOINT ||
    !STORAGE_ROOT_ACCESS_KEY ||
    !STORAGE_ROOT_SECRET_KEY ||
    !IDENTIDADE_ACCESS_KEY ||
    !IDENTIDADE_SECRET_KEY ||
    !IDENTIDADE_POLITICA_NOME ||
    !IDENTIDADE_POLITICA_JSON
  ) {
    throw new Error("Configuração de identidade incompleta.");
  }
  const raiz = { accessKey: STORAGE_ROOT_ACCESS_KEY, secretKey: STORAGE_ROOT_SECRET_KEY };
  await provisionarIdentidade((requisicao) => chamarAdmin(STORAGE_ENDPOINT, requisicao, raiz), {
    accessKey: IDENTIDADE_ACCESS_KEY,
    secretKey: IDENTIDADE_SECRET_KEY,
    politicaNome: IDENTIDADE_POLITICA_NOME,
    politicaJson: IDENTIDADE_POLITICA_JSON,
  });
  console.log(`identidade ${IDENTIDADE_ACCESS_KEY} provisionada com a política ${IDENTIDADE_POLITICA_NOME}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((erro) => {
    console.error(`falha ao provisionar identidade: ${erro.message}`);
    process.exitCode = 1;
  });
}
