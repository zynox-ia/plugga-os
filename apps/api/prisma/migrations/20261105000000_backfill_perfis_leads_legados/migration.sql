-- Pré-requisito de publicação: suspender escritas do CRM antes das migrations
-- e mantê-las suspensas até a nova API estar pronta. A API anterior ainda pode
-- criar negócios sem perfil; isso não pode ocorrer depois deste backfill.
DO $backfill_leads$
DECLARE
  orfaos BIGINT;
  contatos_incompativeis BIGINT;
BEGIN
  -- Preflight sem PII: sem uma fonte real de identidade, a publicação deve parar.
  SELECT COUNT(*) INTO orfaos
  FROM "deals" AS negocio
  LEFT JOIN "lead_profiles" AS perfil ON perfil."deal_id" = negocio."id"
  LEFT JOIN "clients" AS cliente ON cliente."id" = negocio."client_id"
  WHERE perfil."deal_id" IS NULL AND cliente."id" IS NULL;
  IF orfaos > 0 THEN
    RAISE EXCEPTION 'Backfill de leads bloqueado: % negócio(s) sem perfil e sem cliente.', orfaos
      USING HINT = 'Corrija a identidade dos negócios órfãos antes de reaplicar a migration; nenhum dado foi inventado.';
  END IF;

  SELECT COUNT(*) INTO contatos_incompativeis
  FROM "deals" AS negocio
  LEFT JOIN "client_contacts" AS contato
    ON contato."id" = negocio."contact_id" AND contato."client_id" = negocio."client_id"
  WHERE negocio."contact_id" IS NOT NULL AND negocio."lead_contact_id" IS NULL AND contato."id" IS NULL;
  IF contatos_incompativeis > 0 THEN
    RAISE EXCEPTION 'Backfill de leads bloqueado: % contato(s) legado(s) incompatível(is) com o cliente vinculado.', contatos_incompativeis
      USING HINT = 'Corrija os vínculos antes de reaplicar a migration; contatos de outro cliente nunca são copiados.';
  END IF;

  -- Mantém o contato escolhido acessível na ficha, preservando os vínculos antigos.
  WITH copiados AS (
    INSERT INTO "lead_contacts" (
      "deal_id", "name", "job_title", "role", "phone", "phone_is_whatsapp", "email", "is_primary", "cpf", "rg", "created_at", "updated_at"
    )
    SELECT negocio."id", contato."name", contato."job_title", contato."role", contato."phone", contato."phone_is_whatsapp", contato."email",
      contato."is_primary", contato."cpf", contato."rg", contato."created_at", contato."updated_at"
    FROM "deals" AS negocio
    JOIN "client_contacts" AS contato
      ON contato."id" = negocio."contact_id" AND contato."client_id" = negocio."client_id"
    WHERE negocio."lead_contact_id" IS NULL
    RETURNING "id", "deal_id"
  )
  UPDATE "deals" AS negocio
  SET "lead_contact_id" = copiados."id"
  FROM copiados
  WHERE negocio."id" = copiados."deal_id" AND negocio."lead_contact_id" IS NULL;

  -- Novos campos sem equivalente no cadastro legado permanecem nulos.
  INSERT INTO "lead_profiles" (
    "deal_id", "person_type", "name", "company_name", "legal_name", "document", "phone", "email", "postal_code", "street", "address_complement",
    "district", "city", "state", "origin", "notes", "job_title", "created_at", "updated_at"
  )
  SELECT negocio."id", cliente."person_type", cliente."name", cliente."company", cliente."legal_name", cliente."document", cliente."phone", cliente."email",
    cliente."postal_code", cliente."street", cliente."address_complement", cliente."district", cliente."city", cliente."state", cliente."origin", cliente."notes",
    contato."job_title", cliente."created_at", cliente."updated_at"
  FROM "deals" AS negocio
  JOIN "clients" AS cliente ON cliente."id" = negocio."client_id"
  LEFT JOIN "lead_contacts" AS contato ON contato."id" = negocio."lead_contact_id" AND contato."deal_id" = negocio."id"
  WHERE NOT EXISTS (SELECT 1 FROM "lead_profiles" AS perfil WHERE perfil."deal_id" = negocio."id")
  ON CONFLICT ("deal_id") DO NOTHING;
END
$backfill_leads$;
