-- Additive nullable columns: contracts need a "next action" concept (date +
-- note) so the same ownerId/nextAction blocking rule that already exists on
-- Opportunity can also be enforced on an active Contract. See ADR-less note in
-- apps/api/src/commercial: an active contract may never sit without an owner
-- and a next action.
ALTER TABLE "public"."contracts" ADD COLUMN "next_action_at" TIMESTAMPTZ(6);
ALTER TABLE "public"."contracts" ADD COLUMN "next_action_note" TEXT;
