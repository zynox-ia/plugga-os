import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

/**
 * Os testes de integração leem serviço de verdade — Postgres, MinIO, Mailpit —
 * e precisam saber onde ele está. Sem o `.env`, `STORAGE_ENDPOINT` não chegava
 * ao processo e o armazenamento se declarava desconfigurado: a chave voltava
 * nula e o teste falhava dizendo que esperava texto e recebeu objeto, que é
 * como o JavaScript descreve `null`. Não havia como passar.
 *
 * Mas o `.env` só entra quando algum teste de integração foi pedido. A suíte
 * unitária tem que ser hermética: ela prova, entre outras coisas, que sem
 * provedor de e-mail configurado o adaptador que não envia nada é o escolhido —
 * e essa prova morre se o `EMAIL_PROVIDER` da máquina de quem desenvolve vazar
 * para dentro dela. Teste unitário que muda de resultado conforme o `.env` do
 * computador não está provando o programa, está provando a máquina.
 *
 * `dotenv` não sobrescreve o que já existe no ambiente, então quem exporta a
 * variável na mão — ou a integração contínua — continua mandando.
 */
const pediramIntegracao =
  Object.entries(process.env).some(
    ([nome, valor]) => /^RUN_[A-Z_]+_INTEGRATION_TESTS$/.test(nome) && valor === "true",
  ) || Boolean(process.env.CORPUS_FATURAS);

if (pediramIntegracao) {
  dotenv.config({
    path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  });
}

process.env.NODE_ENV = "test";
// Porta 55432, não 5432. Na máquina de quem desenvolve há um túnel SSH para a
// VPS ocupando a 5432, então este padrão apontava para o banco de PRODUÇÃO
// sempre que o `.env` não definisse a variável. Um teste que escreve tem que
// falhar por não achar banco, nunca acertar o banco errado em silêncio.
process.env.DATABASE_URL ??=
  "postgresql://plugga_os:local_only_change_me@localhost:55432/plugga_os?schema=public";
process.env.DEV_AUTH_ENABLED = "true";
process.env.LOG_LEVEL = "silent";
process.env.AUTH_SESSION_SECRET ??= "test_only_session_secret_change_me_please";
