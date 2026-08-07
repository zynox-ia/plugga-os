-- CreateEnum
CREATE TYPE "public"."client_segment" AS ENUM ('prospect', 'opm', 'pluggamob', 'associacoes_gd', 'inativo');

-- CreateEnum
CREATE TYPE "public"."opportunity_stage" AS ENUM ('leads', 'qualificacao', 'proposta', 'decisao');

-- CreateEnum
CREATE TYPE "public"."opportunity_status" AS ENUM ('aberta', 'ganha', 'perdida', 'revisitar');

-- CreateEnum
CREATE TYPE "public"."contract_status" AS ENUM ('rascunho', 'revisao_interna', 'aguardando_assinatura', 'ativo', 'vencendo', 'encerrado');

-- CreateTable
CREATE TABLE "public"."clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "external_id" TEXT,
    "segment" "public"."client_segment" NOT NULL DEFAULT 'prospect',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opportunities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID,
    "title" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "stage" "public"."opportunity_stage" NOT NULL DEFAULT 'leads',
    "status" "public"."opportunity_status" NOT NULL DEFAULT 'aberta',
    "owner_id" UUID,
    "estimated_value" DECIMAL(14,2),
    "next_action_at" TIMESTAMPTZ(6),
    "next_action_note" TEXT,
    "loss_reason" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opportunity_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "opportunity_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "status" "public"."contract_status" NOT NULL DEFAULT 'rascunho',
    "owner_id" UUID,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_segment_active_idx" ON "public"."clients"("segment", "active");

-- CreateIndex
CREATE INDEX "opportunities_stage_status_idx" ON "public"."opportunities"("stage", "status");

-- CreateIndex
CREATE INDEX "opportunities_client_id_idx" ON "public"."opportunities"("client_id");

-- CreateIndex
CREATE INDEX "opportunity_contacts_opportunity_id_created_at_idx" ON "public"."opportunity_contacts"("opportunity_id", "created_at");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "public"."contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_client_id_idx" ON "public"."contracts"("client_id");

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
