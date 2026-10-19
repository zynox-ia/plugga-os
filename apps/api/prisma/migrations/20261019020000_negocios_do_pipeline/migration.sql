-- Negócios no quadro do pipeline (PLU-271).
--
-- Puramente aditiva: tabelas novas de negócio, etiquetas, UCs e histórico.
-- A empresa do negócio vem do pipeline, sem cópia. Datas de calendário
-- (previsão e revisita) são texto AAAA-MM-DD.

-- CreateEnum
CREATE TYPE "public"."deal_status" AS ENUM ('open', 'won', 'lost');

-- CreateEnum
CREATE TYPE "public"."deal_event_kind" AS ENUM ('created', 'stage_changed', 'won', 'lost', 'transferred');

-- CreateTable
CREATE TABLE "public"."deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contact_id" UUID,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(14,2),
    "expected_close_date" TEXT,
    "status" "public"."deal_status" NOT NULL DEFAULT 'open',
    "stage_entered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "loss_reason_id" UUID,
    "loss_reason_name" TEXT,
    "loss_note" TEXT,
    "revisit_on" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."deal_tags" (
    "deal_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "deal_tags_pkey" PRIMARY KEY ("deal_id","tag_id")
);

-- CreateTable
CREATE TABLE "public"."deal_consumer_units" (
    "deal_id" UUID NOT NULL,
    "consumer_unit_id" UUID NOT NULL,

    CONSTRAINT "deal_consumer_units_pkey" PRIMARY KEY ("deal_id","consumer_unit_id")
);

-- CreateTable
CREATE TABLE "public"."deal_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deal_id" UUID NOT NULL,
    "kind" "public"."deal_event_kind" NOT NULL,
    "from_stage_id" UUID,
    "from_stage_name" TEXT,
    "to_stage_id" UUID,
    "to_stage_name" TEXT,
    "from_pipeline_name" TEXT,
    "to_pipeline_name" TEXT,
    "actor_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_pipeline_id_status_idx" ON "public"."deals"("pipeline_id", "status");

-- CreateIndex
CREATE INDEX "deals_stage_id_idx" ON "public"."deals"("stage_id");

-- CreateIndex
CREATE INDEX "deals_client_id_idx" ON "public"."deals"("client_id");

-- CreateIndex
CREATE INDEX "deals_owner_id_idx" ON "public"."deals"("owner_id");

-- CreateIndex
CREATE INDEX "deal_tags_tag_id_idx" ON "public"."deal_tags"("tag_id");

-- CreateIndex
CREATE INDEX "deal_consumer_units_consumer_unit_id_idx" ON "public"."deal_consumer_units"("consumer_unit_id");

-- CreateIndex
CREATE INDEX "deal_history_deal_id_occurred_at_idx" ON "public"."deal_history"("deal_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_loss_reason_id_fkey" FOREIGN KEY ("loss_reason_id") REFERENCES "public"."pipeline_loss_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_tags" ADD CONSTRAINT "deal_tags_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_tags" ADD CONSTRAINT "deal_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."pipeline_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_consumer_units" ADD CONSTRAINT "deal_consumer_units_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_consumer_units" ADD CONSTRAINT "deal_consumer_units_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_history" ADD CONSTRAINT "deal_history_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deal_history" ADD CONSTRAINT "deal_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

