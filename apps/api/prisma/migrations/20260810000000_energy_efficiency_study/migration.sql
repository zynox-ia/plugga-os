-- Estudo de Eficiência Energética (Plugga → Energia → Eficiência energética).
--
-- Migration puramente aditiva: cria dois tipos e duas tabelas, sem tocar em
-- nada que já existe. O `prisma migrate diff` também sugeriu remover uma chave
-- estrangeira de `cycles` e defaults de `updated_at` em quatro tabelas — drift
-- anterior entre schema e migrations, deixado de fora de propósito: não faz
-- parte deste trabalho e mudaria comportamento de produção sem pedido.

-- CreateEnum
CREATE TYPE "public"."energy_study_status" AS ENUM ('rascunho', 'aguardando_dados', 'dados_recebidos', 'em_extracao', 'em_auditoria', 'em_calculo', 'relatorio_gerado', 'em_validacao', 'bloqueado', 'aprovado_internamente', 'enviado_cliente', 'arquivado', 'cancelado');

-- CreateEnum
CREATE TYPE "public"."energy_calculation_mode" AS ENUM ('preliminar', 'memoria_massa');

-- CreateTable
CREATE TABLE "public"."energy_premise_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "versao" TEXT NOT NULL,
    "vigente_de" TIMESTAMPTZ(6) NOT NULL,
    "bess_modelo" TEXT NOT NULL,
    "bess_capacidade_nominal_kwh" DECIMAL(12,4) NOT NULL,
    "bess_capacidade_util_kwh" DECIMAL(12,4) NOT NULL,
    "bess_potencia_kw" DECIMAL(12,4) NOT NULL,
    "bess_eficiencia_ciclo" DECIMAL(6,4) NOT NULL,
    "bess_capex_por_unidade" DECIMAL(14,2) NOT NULL,
    "fv_capex_por_kwp" DECIMAL(14,2) NOT NULL,
    "fv_produtividade_kwh_por_kwp_mes" DECIMAL(10,4) NOT NULL,
    "fv_percentual_atendimento" DECIMAL(6,4) NOT NULL,
    "horizonte_anos" INTEGER NOT NULL,
    "tma_anual" DECIMAL(6,4) NOT NULL,
    "reajuste_tarifario_anual" DECIMAL(6,4) NOT NULL,
    "tolerancia_ultrapassagem" DECIMAL(6,4) NOT NULL,
    "alteracao_demanda_minima" DECIMAL(6,4) NOT NULL,
    "alteracao_demanda_maxima" DECIMAL(6,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "energy_premise_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."energy_efficiency_studies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "consumer_unit_id" UUID NOT NULL,
    "competence_month" INTEGER NOT NULL,
    "competence_year" INTEGER NOT NULL,
    "status" "public"."energy_study_status" NOT NULL DEFAULT 'rascunho',
    "calculation_mode" "public"."energy_calculation_mode" NOT NULL DEFAULT 'preliminar',
    "premise_version_id" UUID NOT NULL,
    "invoice_data" JSONB NOT NULL,
    "demand_history" JSONB NOT NULL DEFAULT '[]',
    "results" JSONB,
    "validation_issues" JSONB,
    "economia_mensal" DECIMAL(14,2),
    "capex_total" DECIMAL(14,2),
    "document_html" TEXT,
    "document_pdf_path" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "owner_id" UUID,
    "created_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approval_note" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

CONSTRAINT "energy_efficiency_studies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "energy_premise_versions_versao_key" ON "public"."energy_premise_versions"("versao");

-- CreateIndex
CREATE INDEX "energy_premise_versions_vigente_de_idx" ON "public"."energy_premise_versions"("vigente_de");

-- CreateIndex
CREATE INDEX "energy_efficiency_studies_status_idx" ON "public"."energy_efficiency_studies"("status");

-- CreateIndex
CREATE INDEX "energy_efficiency_studies_client_id_idx" ON "public"."energy_efficiency_studies"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "energy_study_uc_competencia_versao_key" ON "public"."energy_efficiency_studies"("consumer_unit_id", "competence_year", "competence_month", "version", "revision");

-- AddForeignKey
ALTER TABLE "public"."energy_efficiency_studies" ADD CONSTRAINT "energy_efficiency_studies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."energy_efficiency_studies" ADD CONSTRAINT "energy_efficiency_studies_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."energy_efficiency_studies" ADD CONSTRAINT "energy_efficiency_studies_premise_version_id_fkey" FOREIGN KEY ("premise_version_id") REFERENCES "public"."energy_premise_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
