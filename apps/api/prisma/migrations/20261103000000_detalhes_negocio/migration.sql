-- PLU-278: detalhe e edição com histórico. Versão no banco cobre todos os
-- escritores existentes de deals, inclusive desfechos e ações em lote.
ALTER TABLE "deals" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "deals" ADD CONSTRAINT "deals_version_positive" CHECK ("version" > 0);
ALTER TYPE "deal_event_kind" ADD VALUE IF NOT EXISTS 'field_changed';
ALTER TABLE "deal_history"
  ADD COLUMN "field" TEXT,
  ADD COLUMN "before_value" JSONB,
  ADD COLUMN "after_value" JSONB;
CREATE INDEX "deal_history_deal_id_occurred_at_id_idx"
  ON "deal_history" ("deal_id", "occurred_at", "id");

CREATE FUNCTION "increment_deal_version"() RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "deals_increment_version"
  BEFORE UPDATE ON "deals"
  FOR EACH ROW EXECUTE FUNCTION "increment_deal_version"();
