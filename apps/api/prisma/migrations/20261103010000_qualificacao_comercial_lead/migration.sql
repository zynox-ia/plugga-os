BEGIN;

ALTER TABLE "lead_profiles"
  ADD COLUMN "company_name" TEXT,
  ADD COLUMN "landline_phone" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "main_interest" TEXT,
  ADD COLUMN "job_title" TEXT;

-- Preserva o cargo exibido antes da qualificacao ganhar um campo proprio.
UPDATE "lead_profiles" AS perfil
SET "job_title" = contato."job_title"
FROM "deals" AS negocio
JOIN "lead_contacts" AS contato
  ON contato."id" = negocio."lead_contact_id" AND contato."deal_id" = negocio."id"
WHERE perfil."deal_id" = negocio."id" AND contato."job_title" IS NOT NULL;

UPDATE "lead_profiles" AS perfil
SET "job_title" = contato."job_title"
FROM "deals" AS negocio
JOIN "client_contacts" AS contato
  ON contato."id" = negocio."contact_id" AND contato."client_id" = negocio."client_id"
WHERE perfil."deal_id" = negocio."id"
  AND negocio."lead_contact_id" IS NULL AND contato."job_title" IS NOT NULL;

COMMIT;
