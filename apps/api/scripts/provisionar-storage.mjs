import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function provisionarBaldes(enviar, baldes) {
  if (!baldes.length || baldes.some((nome) => typeof nome !== "string" || !nome.trim())) {
    throw new Error("Informe os nomes dos baldes.");
  }
  for (const Bucket of new Set(baldes)) {
    try {
      await enviar(new CreateBucketCommand({ Bucket }));
    } catch (erro) {
      if (erro?.name !== "BucketAlreadyOwnedByYou") throw erro;
    }
  }
}

async function main() {
  const { STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_BUCKET, STORAGE_LEGACY_BUCKETS = "" } = process.env;
  if (!STORAGE_ENDPOINT || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY || !STORAGE_BUCKET) throw new Error("Configuracao de armazenamento incompleta.");
  const client = new S3Client({ endpoint: STORAGE_ENDPOINT, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: STORAGE_ACCESS_KEY, secretAccessKey: STORAGE_SECRET_KEY } });
  try {
    await provisionarBaldes((comando) => client.send(comando), [STORAGE_BUCKET, ...STORAGE_LEGACY_BUCKETS.split(",").filter(Boolean)]);
    console.log("Baldes configurados.");
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Falha ao provisionar armazenamento; confira endpoint, credenciais e permissoes."); process.exitCode = 1; });
}
