BEGIN;
ALTER TYPE "deal_event_kind" ADD VALUE IF NOT EXISTS 'document_added';
ALTER TYPE "deal_event_kind" ADD VALUE IF NOT EXISTS 'document_archived';
CREATE TYPE "lead_document_category" AS ENUM ('proposta','conta_de_energia','documento_do_cliente','procuracao_contrato','outros');
CREATE TYPE "lead_document_upload_state" AS ENUM ('pending','ready','cleanup');
CREATE TABLE "lead_documents" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "deal_id" UUID NOT NULL REFERENCES "deals"("id") ON DELETE RESTRICT,
 "category" "lead_document_category" NOT NULL,
 "original_name" TEXT NOT NULL, "safe_name" TEXT NOT NULL,
 "detected_mime" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" BETWEEN 1 AND 26214400),
 "storage_bucket" TEXT NOT NULL, "storage_key" TEXT NOT NULL,
 "sha256" CHAR(64) NOT NULL, "upload_state" "lead_document_upload_state" NOT NULL DEFAULT 'pending',
 "uploaded_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 "archived_at" TIMESTAMPTZ(6), "archived_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
 UNIQUE ("storage_bucket", "storage_key")
);
CREATE INDEX "lead_documents_deal_list_idx" ON "lead_documents" ("deal_id", "archived_at", "created_at", "id");
CREATE UNIQUE INDEX "lead_documents_active_hash_key" ON "lead_documents" ("deal_id", "sha256") WHERE "archived_at" IS NULL AND "upload_state" IN ('pending','ready');
COMMIT;
