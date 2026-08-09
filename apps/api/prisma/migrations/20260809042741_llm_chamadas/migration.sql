-- Consumo da chave de LLM, uma linha por chamada.
--
-- O `prisma migrate` gerou junto um DROP CONSTRAINT em `cycles` e quatro
-- DROP DEFAULT em `updated_at` de outras tabelas. Nada disso pertence a esta
-- mudança: é deriva entre o schema e o banco, acumulada antes. Foi removido à
-- mão — migração carrega uma intenção, e aplicar uma alteração de estrutura que
-- ninguém pediu, de carona, é como se perde um banco de produção.

-- CreateEnum
CREATE TYPE "public"."llm_chamada_status" AS ENUM ('ok', 'erro');

-- CreateTable
CREATE TABLE "public"."llm_chamadas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processo" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "modelo_servido" TEXT,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_saida" INTEGER NOT NULL DEFAULT 0,
    "tokens_cache" INTEGER NOT NULL DEFAULT 0,
    "tokens_raciocinio" INTEGER NOT NULL DEFAULT 0,
    "custo_creditos" DECIMAL(18,8),
    "duracao_ms" INTEGER NOT NULL,
    "status" "public"."llm_chamada_status" NOT NULL,
    "erro" TEXT,
    "referencia" TEXT,
    "geracao_id" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_chamadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_chamadas_processo_criado_em_idx" ON "public"."llm_chamadas"("processo", "criado_em");

-- CreateIndex
CREATE INDEX "llm_chamadas_criado_em_idx" ON "public"."llm_chamadas"("criado_em");

-- CreateIndex
CREATE INDEX "llm_chamadas_modelo_idx" ON "public"."llm_chamadas"("modelo");

-- CreateIndex
CREATE INDEX "llm_chamadas_referencia_idx" ON "public"."llm_chamadas"("referencia");
