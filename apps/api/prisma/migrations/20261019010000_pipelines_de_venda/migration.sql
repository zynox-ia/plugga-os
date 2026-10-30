-- Pipelines de venda configuráveis (PLU-269).
--
-- Puramente aditiva: tabelas novas, sem tocar nas existentes. O pipeline
-- pertence a uma empresa; etapas, etiquetas, motivos de perda e equipe vêm
-- junto e são apagados com ele (um pipeline com negócios só é arquivado).

-- CreateEnum
CREATE TYPE "public"."pipeline_member_role" AS ENUM ('vendedor', 'gestor');

-- CreateTable
CREATE TABLE "public"."pipelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value_label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "won_label" TEXT NOT NULL,
    "lost_label" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pipeline_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stale_after_days" INTEGER,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pipeline_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "pipeline_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pipeline_loss_reasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "asks_revisit_date" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "pipeline_loss_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pipeline_members" (
    "pipeline_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "public"."pipeline_member_role" NOT NULL,

    CONSTRAINT "pipeline_members_pkey" PRIMARY KEY ("pipeline_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_company_id_name_key" ON "public"."pipelines"("company_id", "name");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_position_idx" ON "public"."pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "pipeline_tags_pipeline_id_position_idx" ON "public"."pipeline_tags"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "pipeline_loss_reasons_pipeline_id_position_idx" ON "public"."pipeline_loss_reasons"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "pipeline_members_user_id_idx" ON "public"."pipeline_members"("user_id");

-- AddForeignKey
ALTER TABLE "public"."pipelines" ADD CONSTRAINT "pipelines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipelines" ADD CONSTRAINT "pipelines_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipeline_tags" ADD CONSTRAINT "pipeline_tags_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipeline_loss_reasons" ADD CONSTRAINT "pipeline_loss_reasons_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipeline_members" ADD CONSTRAINT "pipeline_members_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipeline_members" ADD CONSTRAINT "pipeline_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

