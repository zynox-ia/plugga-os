// Executado por STDIN dentro da API atual; nenhuma credencial sai do container.
class FalhaNoPreflight extends Error {}

const bloquear = (motivo) => {
  throw new FalhaNoPreflight(`Publicação bloqueada: ${motivo}`);
};

export async function conferirArmazenamentoAtual(ambiente, { fetch, S3Client, HeadBucketCommand }) {
  let endpoint;
  try {
    endpoint = new URL(ambiente.STORAGE_ENDPOINT);
  } catch {
    bloquear("configuração de armazenamento da API atual indisponível.");
  }
  if (endpoint.hostname === "seaweedfs") {
    bloquear("a API atual ainda usa SeaweedFS. Conclua a migração de armazenamento antes desta publicação.");
  }
  // O novo Compose usa este mesmo endereço. Não aceitar outro backend, mesmo saudável.
  if (endpoint.href !== "http://rustfs:9000/" || endpoint.username || endpoint.password) {
    bloquear("a API atual não aponta para o RustFS previsto no Compose.");
  }
  if (!ambiente.STORAGE_ACCESS_KEY?.trim() || !ambiente.STORAGE_SECRET_KEY?.trim()) {
    bloquear("credenciais de armazenamento da API atual indisponíveis.");
  }

  try {
    const resposta = await fetch("http://rustfs:9000/health/ready", {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) bloquear("RustFS não está pronto pela rede da API atual.");
  } catch {
    bloquear("RustFS não está pronto pela rede da API atual.");
  }

  const cliente = new S3Client({
    endpoint: "http://rustfs:9000",
    region: ambiente.STORAGE_REGION || "us-east-1",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: ambiente.STORAGE_ACCESS_KEY,
      secretAccessKey: ambiente.STORAGE_SECRET_KEY,
    },
  });
  try {
    // Balde de negócio já usado antes desta release. O balde novo pode ainda
    // não existir; criá-lo ou consultá-lo não comprovaria continuidade do legado.
    await cliente.send(new HeadBucketCommand({ Bucket: "plugga-energia-opm" }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  } catch {
    bloquear("a API atual não consegue consultar o balde legado no RustFS; confira migração e permissões.");
  } finally {
    cliente.destroy();
  }
}

if (process.argv[2] === "--preflight-storage-publicacao") {
  try {
    const sdk = await import("@aws-sdk/client-s3");
    await conferirArmazenamentoAtual(process.env, { ...sdk, fetch: globalThis.fetch });
    console.log("Armazenamento atual confirmado: RustFS pronto e balde legado acessível. Nenhum objeto foi alterado.");
  } catch (erro) {
    console.error(erro instanceof FalhaNoPreflight
      ? erro.message
      : "Publicação bloqueada: não foi possível conferir o armazenamento na API atual.");
    process.exitCode = 1;
  }
}
