import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { calcularHashDocumento, verificarIntegridadeDocumento } from "./integridade.js";

describe("integridade do documento persistido", () => {
  it("aceita exatamente o conteúdo que foi validado", () => {
    const html = "<html><body>Relatório aprovado</body></html>";
    expect(() => verificarIntegridadeDocumento(html, calcularHashDocumento(html))).not.toThrow();
  });

  it("bloqueia conteúdo alterado depois da validação", () => {
    const hash = calcularHashDocumento("<html>original</html>");
    expect(() => verificarIntegridadeDocumento("<html>alterado</html>", hash)).toThrow(
      ConflictException,
    );
  });

  it("mantém leitura compatível para documento legado sem hash", () => {
    expect(() => verificarIntegridadeDocumento("<html>legado</html>", null)).not.toThrow();
  });

  it("bloqueia documento novo cujo hash foi removido", () => {
    expect(() => verificarIntegridadeDocumento("<html>novo</html>", null, true)).toThrow(
      ConflictException,
    );
  });
});
