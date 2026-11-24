import { describe, expect, it } from "vitest";
import { parseEmergencyMfaArgs } from "./mfa-emergency-options";
const args = ["--user", "01234567-0123-0123-0123-0123456789ab", "--reason", "Solicitação sintética", "--authorization", "AUTORIZADO_PELO_ANDRE"];
describe("CLI de emergência exige autorização explícita e argumentos estritos", () => {
  it("aceita somente a declaração operacional completa", () => { expect(parseEmergencyMfaArgs(args)).toMatchObject({ authorization: "AUTORIZADO_PELO_ANDRE", reason: "Solicitação sintética" }); });
  it.each([[], args.slice(0, 4), [...args, "--user", args[1]!], [...args, "--force", "true"], ["--user", "invalid", ...args.slice(2)], [...args.slice(0, 5), "no"]].map((args) => ({ args })))("recusa parâmetros inválidos $args", ({ args }) => { expect(() => parseEmergencyMfaArgs(args)).toThrow(); });
});
