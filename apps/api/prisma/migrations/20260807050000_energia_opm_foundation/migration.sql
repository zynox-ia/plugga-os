-- CreateEnum
CREATE TYPE "public"."consumer_unit_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "public"."market_migration_stage" AS ENUM ('analise', 'contratacao', 'documentacao', 'denuncia', 'ativacao');

-- CreateEnum
CREATE TYPE "public"."market_migration_status" AS ENUM ('em_andamento', 'ativa', 'cancelada');

-- CreateEnum
CREATE TYPE "public"."cycle_status" AS ENUM ('aguardando_documentos', 'documentos_recebidos', 'em_auditoria', 'relatorio_pronto', 'validado_internamente', 'enviado', 'fechado');

-- CreateEnum
CREATE TYPE "public"."cycle_report_status" AS ENUM ('nao_gerado', 'gerado', 'aprovado', 'reenviado_apos_correcao');

-- CreateEnum
CREATE TYPE "public"."audit_origin" AS ENUM ('ciclo_mensal', 'migracao_ml', 'avulsa');

-- CreateEnum
CREATE TYPE "public"."audit_type" AS ENUM ('conferencia_fatura', 'contestacao', 'validacao_migracao', 'oportunidade');

-- CreateEnum
CREATE TYPE "public"."audit_status" AS ENUM ('em_analise', 'divergencia_encontrada', 'contestacao_aberta', 'resolvida', 'inconclusiva', 'sem_divergencia');

-- CreateEnum
CREATE TYPE "public"."contestation_status" AS ENUM ('rascunho', 'aberta', 'aguardando_distribuidora', 'deferida', 'indeferida', 'parcialmente_deferida', 'encerrada');

-- CreateTable
CREATE TABLE "public"."consumer_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "distributor" TEXT NOT NULL,
    "address" TEXT,
    "status" "public"."consumer_unit_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consumer_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."market_migrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID,
    "consumer_unit_id" UUID NOT NULL,
    "stage" "public"."market_migration_stage" NOT NULL DEFAULT 'analise',
    "status" "public"."market_migration_status" NOT NULL DEFAULT 'em_andamento',
    "owner_id" UUID,
    "next_action_at" TIMESTAMPTZ(6),
    "next_action_note" TEXT,
    "cancel_reason" TEXT,
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "market_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "consumer_unit_id" UUID NOT NULL,
    "market_migration_id" UUID,
    "competence_month" INTEGER NOT NULL,
    "competence_year" INTEGER NOT NULL,
    "status" "public"."cycle_status" NOT NULL DEFAULT 'aguardando_documentos',
    "owner_id" UUID,
    "next_action_at" TIMESTAMPTZ(6),
    "next_action_note" TEXT,
    "report_status" "public"."cycle_report_status" NOT NULL DEFAULT 'nao_gerado',
    "report_version" INTEGER NOT NULL DEFAULT 0,
    "report_generated_at" TIMESTAMPTZ(6),
    "report_approved_at" TIMESTAMPTZ(6),
    "report_approved_by_id" UUID,
    "report_sent_at" TIMESTAMPTZ(6),
    "report_file_id" TEXT,
    "estimated_savings" DECIMAL(14,2),
    "realized_savings" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin" "public"."audit_origin" NOT NULL,
    "type" "public"."audit_type" NOT NULL,
    "status" "public"."audit_status" NOT NULL DEFAULT 'em_analise',
    "cycle_id" UUID,
    "market_migration_id" UUID,
    "summary" TEXT,
    "divergence_blocks_closing" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contestations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "audit_id" UUID NOT NULL,
    "distributor" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "estimated_amount" DECIMAL(14,2),
    "protocol" TEXT,
    "opened_at" TIMESTAMPTZ(6),
    "expected_response_at" TIMESTAMPTZ(6),
    "status" "public"."contestation_status" NOT NULL DEFAULT 'rascunho',
    "owner_id" UUID,
    "financial_result" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumer_units_client_id_idx" ON "public"."consumer_units"("client_id");

-- CreateIndex
CREATE INDEX "market_migrations_stage_status_idx" ON "public"."market_migrations"("stage", "status");

-- CreateIndex
CREATE INDEX "market_migrations_consumer_unit_id_idx" ON "public"."market_migrations"("consumer_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "cycles_consumer_unit_id_competence_month_competence_year_key" ON "public"."cycles"("consumer_unit_id", "competence_month", "competence_year");

-- CreateIndex
CREATE INDEX "cycles_status_idx" ON "public"."cycles"("status");

-- CreateIndex
CREATE INDEX "cycles_client_id_idx" ON "public"."cycles"("client_id");

-- CreateIndex
CREATE INDEX "audits_origin_status_idx" ON "public"."audits"("origin", "status");

-- CreateIndex
CREATE INDEX "audits_cycle_id_idx" ON "public"."audits"("cycle_id");

-- CreateIndex
CREATE INDEX "audits_market_migration_id_idx" ON "public"."audits"("market_migration_id");

-- CreateIndex
CREATE UNIQUE INDEX "contestations_audit_id_key" ON "public"."contestations"("audit_id");

-- CreateIndex
CREATE INDEX "contestations_status_idx" ON "public"."contestations"("status");

-- AddForeignKey
ALTER TABLE "public"."consumer_units" ADD CONSTRAINT "consumer_units_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."market_migrations" ADD CONSTRAINT "market_migrations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."market_migrations" ADD CONSTRAINT "market_migrations_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."market_migrations" ADD CONSTRAINT "market_migrations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cycles" ADD CONSTRAINT "cycles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cycles" ADD CONSTRAINT "cycles_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cycles" ADD CONSTRAINT "cycles_market_migration_id_fkey" FOREIGN KEY ("market_migration_id") REFERENCES "public"."market_migrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cycles" ADD CONSTRAINT "cycles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cycles" ADD CONSTRAINT "cycles_report_approved_by_id_fkey" FOREIGN KEY ("report_approved_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audits" ADD CONSTRAINT "audits_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audits" ADD CONSTRAINT "audits_market_migration_id_fkey" FOREIGN KEY ("market_migration_id") REFERENCES "public"."market_migrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audits" ADD CONSTRAINT "audits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contestations" ADD CONSTRAINT "contestations_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contestations" ADD CONSTRAINT "contestations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: origin must be coherent with which FK is populated.
ALTER TABLE "public"."audits" ADD CONSTRAINT "audits_origin_fk_coherence_check" CHECK (
  (origin = 'ciclo_mensal' AND cycle_id IS NOT NULL AND market_migration_id IS NULL) OR
  (origin = 'migracao_ml' AND market_migration_id IS NOT NULL AND cycle_id IS NULL) OR
  (origin = 'avulsa' AND cycle_id IS NULL AND market_migration_id IS NULL)
);
