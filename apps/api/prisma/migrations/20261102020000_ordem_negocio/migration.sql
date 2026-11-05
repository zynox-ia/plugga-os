BEGIN;
LOCK TABLE "deals" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "deals" ADD COLUMN "position" NUMERIC(30,10) NOT NULL DEFAULT 0;
WITH ordenados AS (
 SELECT "id", ROW_NUMBER() OVER (PARTITION BY "stage_id" ORDER BY "stage_entered_at" DESC, "id" ASC) * 1024 AS posicao FROM "deals"
)
UPDATE "deals" AS d SET "position" = o.posicao FROM ordenados AS o WHERE d."id" = o."id";
CREATE INDEX "deals_stage_id_position_idx" ON "deals" ("stage_id", "position");
COMMIT;
