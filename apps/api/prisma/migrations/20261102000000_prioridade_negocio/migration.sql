CREATE TYPE "deal_priority" AS ENUM ('urgente', 'medio', 'normal');
ALTER TYPE "deal_event_kind" ADD VALUE 'priority_changed';
ALTER TABLE "deals" ADD COLUMN "priority" "deal_priority";
ALTER TABLE "deal_history" ADD COLUMN "from_priority" "deal_priority", ADD COLUMN "to_priority" "deal_priority";
