-- CreateTable
CREATE TABLE "bitrix_mirror_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "domain" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source_fingerprint" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bitrix_mirror_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bitrix_mirror_records_domain_external_id_key" ON "bitrix_mirror_records"("domain", "external_id");

-- CreateIndex
CREATE INDEX "bitrix_mirror_records_domain_idx" ON "bitrix_mirror_records"("domain");
