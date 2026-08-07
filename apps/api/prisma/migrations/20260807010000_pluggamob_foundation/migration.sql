-- CreateEnum
CREATE TYPE "public"."ev_segment" AS ENUM ('r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6');

-- CreateEnum
CREATE TYPE "public"."ev_session_status" AS ENUM ('active', 'completed', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "public"."location_status" AS ENUM ('active', 'inactive', 'unknown');

-- CreateEnum
CREATE TYPE "public"."incident_status" AS ENUM ('open', 'investigating', 'resolved', 'blocked');

-- CreateEnum
CREATE TYPE "public"."settlement_status" AS ENUM ('draft', 'auditing', 'ready_for_review', 'approved', 'exported', 'blocked');

-- CreateTable
CREATE TABLE "public"."ev_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone_masked" TEXT,
    "segment" "public"."ev_segment" NOT NULL DEFAULT 'r0',
    "opted_out_at" TIMESTAMPTZ(6),
    "wallet_balance" DECIMAL(14,2),
    "last_session_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ev_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ev_segment_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "segment" "public"."ev_segment" NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ev_segment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ev_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "next_action_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ev_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."partners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."location_status" NOT NULL DEFAULT 'unknown',
    "timezone" TEXT NOT NULL DEFAULT 'America/Manaus',

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."connectors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "station_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ev_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "connector_id" UUID,
    "token_rfid" TEXT,
    "status" "public"."ev_session_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "kwh" DECIMAL(14,3),
    "amount" DECIMAL(14,2),

    CONSTRAINT "ev_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL,
    "status" "public"."incident_status" NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "location_id" UUID,
    "settlement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."coupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL,
    "week_start" TIMESTAMPTZ(6) NOT NULL,
    "week_end" TIMESTAMPTZ(6) NOT NULL,
    "status" "public"."settlement_status" NOT NULL DEFAULT 'draft',

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."settlement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "session_id" UUID,
    "token_rfid" TEXT,
    "classification" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "blocked_reason" TEXT,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."d14_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "available_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "d14_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ev_users_external_id_key" ON "public"."ev_users"("external_id");

-- CreateIndex
CREATE INDEX "ev_users_segment_opted_out_at_idx" ON "public"."ev_users"("segment", "opted_out_at");

-- CreateIndex
CREATE INDEX "ev_segment_history_user_id_changed_at_idx" ON "public"."ev_segment_history"("user_id", "changed_at");

-- CreateIndex
CREATE INDEX "ev_contacts_user_id_created_at_idx" ON "public"."ev_contacts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "partners_key_key" ON "public"."partners"("key");

-- CreateIndex
CREATE INDEX "locations_partner_id_status_idx" ON "public"."locations"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ev_sessions_external_id_key" ON "public"."ev_sessions"("external_id");

-- CreateIndex
CREATE INDEX "ev_sessions_location_id_status_idx" ON "public"."ev_sessions"("location_id", "status");

-- CreateIndex
CREATE INDEX "ev_sessions_user_id_started_at_idx" ON "public"."ev_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "incidents_status_created_at_idx" ON "public"."incidents"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "public"."coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_partner_id_week_start_key" ON "public"."settlements"("partner_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_lines_session_id_key" ON "public"."settlement_lines"("session_id");

-- CreateIndex
CREATE INDEX "settlement_lines_settlement_id_blocked_reason_idx" ON "public"."settlement_lines"("settlement_id", "blocked_reason");

-- AddForeignKey
ALTER TABLE "public"."ev_segment_history" ADD CONSTRAINT "ev_segment_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ev_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ev_contacts" ADD CONSTRAINT "ev_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ev_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."locations" ADD CONSTRAINT "locations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stations" ADD CONSTRAINT "stations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."connectors" ADD CONSTRAINT "connectors_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ev_sessions" ADD CONSTRAINT "ev_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ev_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ev_sessions" ADD CONSTRAINT "ev_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ev_sessions" ADD CONSTRAINT "ev_sessions_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."incidents" ADD CONSTRAINT "incidents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ev_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."incidents" ADD CONSTRAINT "incidents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ev_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."incidents" ADD CONSTRAINT "incidents_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."incidents" ADD CONSTRAINT "incidents_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."settlements" ADD CONSTRAINT "settlements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."settlement_lines" ADD CONSTRAINT "settlement_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ev_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."d14_credits" ADD CONSTRAINT "d14_credits_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
