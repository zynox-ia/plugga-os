-- Settlement blockers must expose an owner, the missing evidence and the next
-- action in the "Pode fechar?" panel. These nullable columns preserve all
-- existing settlement lines and are cleared only through the local resolution
-- workflow, whose event_log record keeps the resolution history.
ALTER TABLE "public"."settlement_lines"
  ADD COLUMN "blocker_assignee" TEXT,
  ADD COLUMN "blocker_evidence_missing" TEXT,
  ADD COLUMN "blocker_next_action" TEXT;
