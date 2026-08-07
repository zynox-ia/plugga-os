-- Link local relationship evidence to the EV session and coupon records.
ALTER TABLE "ev_contacts" ADD COLUMN "session_id" UUID;
ALTER TABLE "coupons" ADD COLUMN "user_id" UUID;
ALTER TABLE "coupons" ADD COLUMN "session_id" UUID;

ALTER TABLE "ev_contacts"
  ADD CONSTRAINT "ev_contacts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "ev_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "ev_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "ev_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "coupons_user_id_created_at_idx" ON "coupons"("user_id", "created_at");
CREATE INDEX "coupons_session_id_idx" ON "coupons"("session_id");
