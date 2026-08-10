-- Login federado com o Google (adendo ao ADR-0008, 10/08/2026).
--
-- Puramente aditiva: `users`, `user_credentials`, `sessions` e `auth_tokens`
-- não mudam de forma. Uma conta existente continua entrando por senha sem que
-- nenhuma linha desta tabela exista, e o rollback do recurso é desligar a
-- feature flag — não apagar esta tabela.
--
-- Não é trilha de auditoria, então nenhum gatilho append-only é aplicado aqui;
-- o vínculo em si é registrado em `events` como `auth.google_identity.linked`.

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email_at_link" TEXT NOT NULL,
    "last_observed_email" TEXT NOT NULL,
    "hosted_domain" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Um `sub` do Google pertence a uma pessoa só: é esta constraint que decide a
-- corrida entre dois primeiros logins simultâneos, não a checagem do serviço.
CREATE UNIQUE INDEX "user_identities_provider_subject_key"
    ON "user_identities"("provider", "subject");
-- E uma pessoa tem no máximo uma conta por provedor: trocar de conta Google é
-- ato administrativo, nunca efeito colateral de um login.
CREATE UNIQUE INDEX "user_identities_user_id_provider_key"
    ON "user_identities"("user_id", "provider");
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
