BEGIN;

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('task','call','meeting','visit')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','medio','urgente')),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','process','revisit')),
  rule_key text,
  created_by_type text NOT NULL CHECK (created_by_type IN ('user','agent','system')),
  created_by_id uuid NOT NULL,
  creation_request_id uuid NOT NULL,
  creation_hash char(64) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  current_round_number integer NOT NULL DEFAULT 1 CHECK (current_round_number > 0),
  CONSTRAINT activities_target CHECK ((deal_id IS NOT NULL)::integer + (client_id IS NOT NULL)::integer = 1),
  CONSTRAINT activities_manual_rule CHECK (origin <> 'manual' OR rule_key IS NULL),
  CONSTRAINT activities_created_by_type_created_by_id_creation_request_id_key UNIQUE (created_by_type, created_by_id, creation_request_id)
);
CREATE INDEX activities_deal_id_id_idx ON public.activities(deal_id,id);
CREATE INDEX activities_client_id_id_idx ON public.activities(client_id,id);
CREATE UNIQUE INDEX activities_process_rule_key ON public.activities(deal_id,rule_key) WHERE rule_key IS NOT NULL;

CREATE TABLE public.activity_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
  number integer NOT NULL CHECK (number > 0),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  starts_at timestamptz(6) NOT NULL,
  due_at timestamptz(6) NOT NULL,
  opened_at timestamptz(6) NOT NULL DEFAULT now(),
  opened_by_type text NOT NULL CHECK (opened_by_type IN ('user','agent','system')),
  opened_by_id uuid NOT NULL,
  source_transition_id uuid,
  ended_at timestamptz(6), end_reason text CHECK (end_reason IN ('completed','revised')),
  completed_at timestamptz(6), completed_by_type text CHECK (completed_by_type IN ('user','agent','system')),
  completed_by_id uuid, outcome_summary text CHECK (length(btrim(outcome_summary)) BETWEEN 1 AND 2000),
  next_activity_id uuid REFERENCES public.activities(id) ON DELETE RESTRICT,
  CONSTRAINT activity_rounds_activity_id_number_key UNIQUE (activity_id,number),
  CONSTRAINT activity_rounds_activity_id_source_transition_id_key UNIQUE (activity_id,source_transition_id),
  CONSTRAINT activity_rounds_schedule CHECK (due_at >= starts_at),
  CONSTRAINT activity_rounds_closed CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  CONSTRAINT activity_rounds_completion CHECK (
    (status = 'done' AND end_reason = 'completed' AND ended_at IS NOT NULL AND completed_at IS NOT NULL
      AND completed_by_id IS NOT NULL AND completed_by_type IS NOT NULL AND outcome_summary IS NOT NULL)
    OR (status <> 'done' AND (end_reason IS NULL OR end_reason = 'revised') AND completed_at IS NULL
      AND completed_by_id IS NULL AND completed_by_type IS NULL AND outcome_summary IS NULL AND next_activity_id IS NULL)
  )
);
CREATE INDEX activity_rounds_owner_id_due_at_idx ON public.activity_rounds(owner_id,due_at);
CREATE UNIQUE INDEX activity_rounds_one_open ON public.activity_rounds(activity_id) WHERE ended_at IS NULL;

CREATE TABLE public.activity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL CHECK (kind IN ('created','updated','completed','reopened')),
  actor_type text NOT NULL CHECK (actor_type IN ('user','agent','system')), actor_id uuid NOT NULL,
  occurred_at timestamptz(6) NOT NULL DEFAULT now(), snapshot jsonb NOT NULL,
  CONSTRAINT activity_changes_activity_id_version_key UNIQUE (activity_id,version)
);
CREATE TABLE public.activity_round_evidence (
  round_id uuid NOT NULL REFERENCES public.activity_rounds(id) ON DELETE RESTRICT,
  lead_document_id uuid NOT NULL REFERENCES public.lead_documents(id) ON DELETE RESTRICT,
  PRIMARY KEY(round_id,lead_document_id)
);

CREATE FUNCTION plugga_security.activity_target(deal uuid, client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT CASE WHEN $1 IS NOT NULL THEN plugga_security.negocio($1)
  WHEN $2 IS NOT NULL THEN plugga_security.cliente($2) ELSE false END $fn$;
REVOKE ALL ON FUNCTION plugga_security.activity_target(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.activity_target(uuid,uuid) TO plugga_runtime;

DO $tables$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['activities','activity_rounds','activity_changes','activity_round_evidence'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime',t);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)',t,current_user);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO plugga_runtime',t);
  END LOOP;
END $tables$;
GRANT UPDATE ON public.activities,public.activity_rounds TO plugga_runtime;

CREATE POLICY rls_ler ON public.activities FOR SELECT TO plugga_runtime
  USING (plugga_security.activity_target(deal_id,client_id));
CREATE POLICY rls_inserir ON public.activities FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.activity_target(deal_id,client_id) AND created_by_id = plugga_security.usuario_id());
CREATE POLICY rls_atualizar ON public.activities FOR UPDATE TO plugga_runtime
  USING (plugga_security.activity_target(deal_id,client_id)) WITH CHECK (plugga_security.activity_target(deal_id,client_id));

CREATE POLICY rls_ler ON public.activity_rounds FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));
CREATE POLICY rls_inserir ON public.activity_rounds FOR INSERT TO plugga_runtime
  WITH CHECK (opened_by_id = plugga_security.usuario_id() AND EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));
CREATE POLICY rls_atualizar ON public.activity_rounds FOR UPDATE TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id)
    AND (completed_by_id IS NULL OR completed_by_id = plugga_security.usuario_id()));
CREATE POLICY rls_ler ON public.activity_changes FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));
CREATE POLICY rls_inserir ON public.activity_changes FOR INSERT TO plugga_runtime
  WITH CHECK (actor_id = plugga_security.usuario_id() AND EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));
CREATE POLICY rls_ler ON public.activity_round_evidence FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.activity_rounds r WHERE r.id = round_id));
CREATE POLICY rls_inserir ON public.activity_round_evidence FOR INSERT TO plugga_runtime
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.activity_rounds r JOIN public.activities a ON a.id = r.activity_id
      JOIN public.lead_documents d ON d.deal_id = a.deal_id
    WHERE r.id = round_id AND r.ended_at IS NULL AND d.id = lead_document_id
      AND d.upload_state = 'ready' AND d.archived_at IS NULL
  ));

CREATE FUNCTION public.preserve_activity_identity() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF ROW(NEW.deal_id,NEW.client_id,NEW.origin,NEW.rule_key,NEW.created_by_type,NEW.created_by_id,NEW.creation_request_id,NEW.creation_hash,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.deal_id,OLD.client_id,OLD.origin,OLD.rule_key,OLD.created_by_type,OLD.created_by_id,OLD.creation_request_id,OLD.creation_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'Identidade da atividade é imutável' USING ERRCODE='23514';
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $fn$;
CREATE TRIGGER activities_identity_version BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.preserve_activity_identity();

CREATE FUNCTION public.preserve_activity_round() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.ended_at IS NOT NULL OR ROW(NEW.activity_id,NEW.number,NEW.opened_at,NEW.opened_by_type,NEW.opened_by_id,NEW.source_transition_id)
    IS DISTINCT FROM ROW(OLD.activity_id,OLD.number,OLD.opened_at,OLD.opened_by_type,OLD.opened_by_id,OLD.source_transition_id) THEN
    RAISE EXCEPTION 'Rodada encerrada ou identidade da rodada é imutável' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER activity_rounds_preserve BEFORE UPDATE ON public.activity_rounds FOR EACH ROW EXECUTE FUNCTION public.preserve_activity_round();

-- A raiz e a primeira rodada nascem no mesmo tx; conferir a referência só no commit.
CREATE FUNCTION public.check_activity_current_round() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.activity_rounds r WHERE r.activity_id = NEW.id AND r.number = NEW.current_round_number) THEN
    RAISE EXCEPTION 'Rodada vigente ausente' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER activities_current_round AFTER INSERT OR UPDATE ON public.activities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_activity_current_round();

COMMIT;
