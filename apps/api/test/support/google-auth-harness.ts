import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import { AuditRepository, type EventAppend } from "../../src/audit/audit.repository";
import { AuthRepository } from "../../src/auth/auth.repository";
import {
  GoogleIdentityVerifier,
  GoogleVerificationError,
  type GoogleIdentityClaims,
} from "../../src/auth/google-identity.verifier";
import { configureApp } from "../../src/configure-app";
import { SessionLookupRepository } from "../../src/core/auth/session-lookup.repository";
import { EmailPort } from "../../src/email/email.port";
import {
  CapturingEmailPort,
  InMemoryAuthRepository,
  InMemorySessionLookup,
  InMemoryStore,
} from "./in-memory-auth";

export const GOOGLE_CSRF = "csrf-token-from-gis";
export const GOOGLE_CREDENTIAL = "valid.google.id.token";

export const defaultClaims: GoogleIdentityClaims = {
  subject: "google-sub-1",
  email: "pessoa@gmail.com",
  emailVerified: true,
  hostedDomain: null,
};

/**
 * Dublê da PORTA de verificação — não do Google.
 *
 * É esta substituição que torna a política inteira (quem entra, quem é
 * recusado, o que é auditado) verificável sem rede, sem conta real e sem
 * nenhum atalho por variável de ambiente, que existiria também em produção. A
 * fronteira externa fica coberta pela biblioteca oficial mais um smoke
 * controlado no rollout.
 */
export class FakeGoogleVerifier extends GoogleIdentityVerifier {
  claims: GoogleIdentityClaims = { ...defaultClaims };
  failure: GoogleVerificationError | null = null;
  /** Quantas vezes foi chamado — prova que o CSRF barra ANTES daqui. */
  calls = 0;

  async verify(idToken: string): Promise<GoogleIdentityClaims> {
    this.calls += 1;
    if (this.failure) {
      throw this.failure;
    }
    if (idToken !== GOOGLE_CREDENTIAL) {
      throw new GoogleVerificationError("invalid_token", "google id token is not valid");
    }
    return this.claims;
  }
}

export class RecordingAuditRepository extends AuditRepository {
  readonly events: EventAppend[] = [];

  async appendEvent(event: EventAppend): Promise<void> {
    this.events.push(event);
  }

  async appendTrail(): Promise<never> {
    throw new Error("not used in the google auth e2e");
  }
}

export interface GoogleHarness {
  app: NestExpressApplication;
  store: InMemoryStore;
  verifier: FakeGoogleVerifier;
  audit: RecordingAuditRepository;
}

export async function bootGoogleHarness(): Promise<GoogleHarness> {
  const store = new InMemoryStore();
  const verifier = new FakeGoogleVerifier();
  const audit = new RecordingAuditRepository();

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthRepository)
    .useValue(new InMemoryAuthRepository(store))
    .overrideProvider(SessionLookupRepository)
    .useValue(new InMemorySessionLookup(store))
    .overrideProvider(GoogleIdentityVerifier)
    .useValue(verifier)
    .overrideProvider(EmailPort)
    .useValue(new CapturingEmailPort())
    .overrideProvider(AuditRepository)
    .useValue(audit)
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  // A MESMA função que main.ts chama: é ela que instala o cookie-parser de que
  // a leitura do `g_csrf_token` depende, e o `trust proxy` do throttle por IP.
  configureApp(app);
  await app.init();
  await app.listen(0);
  return { app, store, verifier, audit };
}

// Sem IP próprio por teste todos dividem o mesmo balde de 10/min e os últimos
// veriam 429 sem terem pedido isso (mesma armadilha do auth.e2e.spec.ts).
let ipCounter = 0;
export function nextTestIp(): string {
  ipCounter += 1;
  return `10.98.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export function postGoogle(
  app: NestExpressApplication,
  options: {
    credential?: string;
    bodyCsrf?: string;
    cookieCsrf?: string | null;
    ip?: string;
  } = {},
) {
  const cookieCsrf = options.cookieCsrf === undefined ? GOOGLE_CSRF : options.cookieCsrf;
  const call = request(app.getHttpServer())
    .post("/auth/google")
    .set("X-Forwarded-For", options.ip ?? nextTestIp())
    .type("form");
  if (cookieCsrf !== null) {
    call.set("Cookie", `g_csrf_token=${cookieCsrf}`);
  }
  return call.send({
    credential: options.credential ?? GOOGLE_CREDENTIAL,
    g_csrf_token: options.bodyCsrf ?? GOOGLE_CSRF,
    // O Google acrescenta campos próprios ao formulário; o contrato não pode
    // recusar o POST inteiro por causa de um deles.
    select_by: "btn",
  });
}
