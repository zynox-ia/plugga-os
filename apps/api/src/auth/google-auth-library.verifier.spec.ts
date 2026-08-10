import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyIdToken = vi.fn();

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

// `vi.mock` é içado acima destes imports pelo próprio vitest, então o
// adaptador já nasce falando com o dublê da biblioteca do Google.
import { GoogleAuthLibraryVerifier } from "./google-auth-library.verifier";
import { GoogleVerificationError } from "./google-identity.verifier";

const CLIENT_ID = "test-only.apps.googleusercontent.com";

function config(clientId = CLIENT_ID): ConfigService {
  return { get: () => clientId } as unknown as ConfigService;
}

function ticket(payload: Record<string, unknown> | undefined) {
  return { getPayload: () => payload };
}

describe("GoogleAuthLibraryVerifier", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("passes the configured client id as the audience", async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: "abc", email: "pessoa@gmail.com", email_verified: true }),
    );

    const claims = await new GoogleAuthLibraryVerifier(config()).verify("token");

    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: "token", audience: CLIENT_ID });
    expect(claims).toEqual({
      subject: "abc",
      email: "pessoa@gmail.com",
      emailVerified: true,
      hostedDomain: null,
    });
  });

  it("carries the Workspace domain through when the claim is present", async () => {
    verifyIdToken.mockResolvedValue(
      ticket({
        sub: "abc",
        email: "pessoa@plugga.com.br",
        email_verified: true,
        hd: "plugga.com.br",
      }),
    );

    const claims = await new GoogleAuthLibraryVerifier(config()).verify("token");
    expect(claims.hostedDomain).toBe("plugga.com.br");
  });

  it("treats a rejected signature, audience or expiry as an invalid token", async () => {
    verifyIdToken.mockRejectedValue(new Error("Wrong recipient, payload audience != requiredAudience"));

    await expect(new GoogleAuthLibraryVerifier(config()).verify("token")).rejects.toMatchObject({
      kind: "invalid_token",
    });
  });

  it("separates a JWKS/network outage from an invalid token", async () => {
    // A diferença é o que separa "sua conta não pode entrar" de "o Google está
    // fora do ar" na tela — e é a diferença entre o suporte procurar defeito na
    // conta de quem tentou entrar e olhar para a nossa infraestrutura.
    for (const mensagem of [
      "Failed to retrieve verification certificates: getaddrinfo EAI_AGAIN www.googleapis.com",
      "fetch failed",
      "connect ECONNREFUSED 142.250.0.1:443",
    ]) {
      verifyIdToken.mockRejectedValueOnce(new Error(mensagem));
      await expect(new GoogleAuthLibraryVerifier(config()).verify("token")).rejects.toMatchObject({
        kind: "unavailable",
      });
    }
  });

  it("refuses a payload without sub or e-mail instead of inventing an identity", async () => {
    verifyIdToken.mockResolvedValue(ticket({ email: "pessoa@gmail.com" }));
    await expect(new GoogleAuthLibraryVerifier(config()).verify("token")).rejects.toBeInstanceOf(
      GoogleVerificationError,
    );

    verifyIdToken.mockResolvedValue(ticket(undefined));
    await expect(new GoogleAuthLibraryVerifier(config()).verify("token")).rejects.toMatchObject({
      kind: "invalid_token",
    });
  });

  it("fails closed when no client id is configured", async () => {
    // Nunca "aceita qualquer audiência": sem client ID não há o que verificar.
    await expect(new GoogleAuthLibraryVerifier(config("")).verify("token")).rejects.toMatchObject(
      { kind: "unavailable" },
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
