BEGIN;
ALTER TABLE "deals" ALTER COLUMN "client_id" DROP NOT NULL;
ALTER TABLE "pipelines" ADD COLUMN "ask_client_conversion" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "lead_profiles" (
 "deal_id" UUID PRIMARY KEY REFERENCES "deals"("id") ON DELETE CASCADE,
 "person_type" "client_person_type" NOT NULL, "name" TEXT NOT NULL,
 "legal_name" TEXT, "document" TEXT, "phone" TEXT, "email" TEXT,
 "postal_code" TEXT, "street" TEXT, "address_complement" TEXT,
 "district" TEXT, "city" TEXT, "state" TEXT, "origin" "client_origin", "notes" TEXT,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE "lead_contacts" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "deal_id" UUID NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL, "job_title" TEXT, "role" "client_contact_role",
 "phone" TEXT, "phone_is_whatsapp" BOOLEAN NOT NULL DEFAULT false, "email" TEXT,
 "is_primary" BOOLEAN NOT NULL DEFAULT false, "cpf" TEXT, "rg" TEXT,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 UNIQUE ("id", "deal_id")
);
CREATE INDEX "lead_contacts_deal_id_idx" ON "lead_contacts" ("deal_id");
ALTER TABLE "deals" ADD COLUMN "lead_contact_id" UUID;
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_contact_owner_fkey" FOREIGN KEY ("lead_contact_id", "id") REFERENCES "lead_contacts" ("id", "deal_id");
ALTER TYPE "deal_event_kind" ADD VALUE IF NOT EXISTS 'client_converted';
COMMIT;
