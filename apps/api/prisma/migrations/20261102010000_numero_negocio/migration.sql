BEGIN;
LOCK TABLE "deals" IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE "deals_number_seq" AS INTEGER;
ALTER TABLE "deals" ADD COLUMN "number" INTEGER;
ALTER SEQUENCE "deals_number_seq" OWNED BY "deals"."number";
WITH ordenados AS (
 SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC)::INTEGER AS numero FROM "deals"
)
UPDATE "deals" AS d SET "number" = o.numero FROM ordenados AS o WHERE d."id" = o."id";
SELECT setval('"deals_number_seq"', COALESCE(MAX("number"), 1), COUNT(*) > 0) FROM "deals";
ALTER TABLE "deals" ALTER COLUMN "number" SET DEFAULT nextval('"deals_number_seq"');
ALTER TABLE "deals" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "deals" ADD CONSTRAINT "deals_number_key" UNIQUE ("number");
COMMIT;
