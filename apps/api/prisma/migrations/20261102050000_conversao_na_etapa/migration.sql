BEGIN;
ALTER TABLE "pipeline_stages" ADD COLUMN "asks_client_conversion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pipelines" DROP COLUMN "ask_client_conversion";
COMMIT;
