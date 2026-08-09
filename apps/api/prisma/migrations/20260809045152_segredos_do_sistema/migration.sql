-- Segredos que o sistema guarda para si, cifrados.
--
-- O `prisma migrate` gerou junto, pela segunda vez, um DROP CONSTRAINT em
-- `cycles` e quatro DROP DEFAULT em `updated_at`. É deriva antiga entre o schema
-- e o banco, não esta mudança, e foi removida à mão. Enquanto a deriva não for
-- resolvida num commit próprio, toda migração nova vai nascer com essa carona —
-- e uma delas vai passar despercebida.

-- CreateTable
CREATE TABLE "public"."segredos_do_sistema" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chave" TEXT NOT NULL,
    "valor_cifrado" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "ultimos_quatro" TEXT NOT NULL,
    "atualizado_por" TEXT,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segredos_do_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segredos_do_sistema_chave_key" ON "public"."segredos_do_sistema"("chave");
