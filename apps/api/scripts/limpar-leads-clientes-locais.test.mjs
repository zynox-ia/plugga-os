import assert from "node:assert/strict";
import { test } from "node:test";
import { validarDestino, validarPrevia } from "./limpar-leads-clientes-locais.mjs";

test("aceita somente os dois bancos locais explícitos e recusa produção", () => {
  assert.equal(validarDestino("postgresql://u:p@127.0.0.1:54433/plugga_os_test?schema=public", "test").porta, "54433");
  assert.equal(validarDestino("postgresql://u:p@127.0.0.1:54432/plugga_os?schema=public", "development").porta, "54432");
  for (const url of [
    "postgresql://u:p@127.0.0.1:5432/plugga_os",
    "postgresql://u:p@localhost:54432/plugga_os",
    "postgresql://u:p@postgres:54432/plugga_os",
    "postgresql://u:p@127.0.0.1:54432/outro",
    "postgresql://u:p@127.0.0.1:54432/plugga_os?host=externo",
  ]) assert.throws(() => validarDestino(url, "test"));
  assert.throws(() => validarDestino("postgresql://u:p@127.0.0.1:54432/plugga_os", "production"));
});

test("recusa prévia alterada e dependências não inventariadas", () => {
  const destino = { porta: "54433" };
  const previa = { contagens: [{ tabela: "deals", quantidade: 1 }], dependencias: [{ tabela: "deal_history", nome: "fk", definicao: "x" }], gatilhos: [] };
  assert.throws(() => validarPrevia(previa, previa, destino));
  assert.throws(() => validarPrevia(previa, { ...previa, contagens: [{ tabela: "deals", quantidade: 2 }] }, destino));
  const desconhecida = { ...previa, dependencias: [{ tabela: "nao_inventariada", nome: "fk", definicao: "x" }] };
  assert.throws(() => validarPrevia(desconhecida, desconhecida, destino));
  const documentos = { ...previa, contagens: [{ tabela: "lead_documents", quantidade: 1 }] };
  assert.throws(() => validarPrevia(documentos, documentos, destino));
});
