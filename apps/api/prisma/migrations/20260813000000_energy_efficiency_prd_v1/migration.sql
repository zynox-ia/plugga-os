-- PRD de Auditoria Energética Plugga v1 (09/08/2026).
-- Aditiva: estudos antigos permanecem reproduzíveis e recebem as premissas
-- padrão apenas nas novas colunas.

CREATE TYPE "public"."energy_traffic_light" AS ENUM ('verde', 'amarelo', 'vermelho');

ALTER TABLE "public"."energy_premise_versions"
  ADD COLUMN "bess_dod" DECIMAL(6,4) NOT NULL DEFAULT 1,
  ADD COLUMN "bess_eta_rt" DECIMAL(6,4) NOT NULL DEFAULT 0.9556,
  ADD COLUMN "bess_eta_ele" DECIMAL(6,4) NOT NULL DEFAULT 0.98,
  ADD COLUMN "bess_eta_op" DECIMAL(6,4) NOT NULL DEFAULT 0.99,
  ADD COLUMN "dias_uteis_mes" INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "om_bess_percentual_ano" DECIMAL(6,4) NOT NULL DEFAULT 0.01,
  ADD COLUMN "solar_pr" DECIMAL(6,4) NOT NULL DEFAULT 0.85,
  ADD COLUMN "solar_degradacao_anual" DECIMAL(6,4) NOT NULL DEFAULT 0.005,
  ADD COLUMN "om_solar_percentual_ano" DECIMAL(6,4) NOT NULL DEFAULT 0.01,
  ADD COLUMN "hsp_mensal" JSONB NOT NULL DEFAULT '[5,5,5,5,5,5,5,5,5,5,5,5]',
  ADD COLUMN "soh_anual" JSONB NOT NULL DEFAULT '[1,0.971,0.948,0.927,0.907,0.888,0.87,0.852,0.834,0.817,0.799,0.783,0.763,0.75,0.734,0.718,0.703,0.688,0.673,0.659,0.645]',
  ADD COLUMN "reajuste_om_anual" DECIMAL(6,4) NOT NULL DEFAULT 0.03;

ALTER TABLE "public"."energy_efficiency_studies"
  ADD COLUMN "invoice_context" JSONB,
  ADD COLUMN "reconciliation_proof" JSONB,
  ADD COLUMN "traffic_light" "public"."energy_traffic_light",
  ADD COLUMN "traffic_light_result" JSONB,
  ADD COLUMN "document_html_mobile" TEXT,
  ADD COLUMN "document_hash" TEXT,
  ADD COLUMN "document_mobile_hash" TEXT;

CREATE TABLE "public"."energy_invoice_type_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "distributor" TEXT NOT NULL,
  "regime" TEXT NOT NULL,
  "modality" TEXT NOT NULL,
  "group_code" TEXT NOT NULL,
  "example_uc" TEXT,
  "approved_by_id" UUID,
  "approved_by_text" TEXT NOT NULL,
  "approved_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "energy_invoice_type_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "energy_invoice_type_approvals_key_key"
  ON "public"."energy_invoice_type_approvals"("key");
