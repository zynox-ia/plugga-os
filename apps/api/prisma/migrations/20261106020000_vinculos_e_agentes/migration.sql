BEGIN;

-- Legado incoerente interrompe a migração; não apagamos nem reatribuímos autoria.
DO $preflight$
DECLARE quantidade bigint;
BEGIN
  SELECT count(*) INTO quantidade FROM public.roles WHERE key NOT IN ('admin', 'desenvolvedor');
  IF quantidade > 0 THEN RAISE EXCEPTION 'Preflight: % papéis fora do catálogo; requer saneamento humano', quantidade; END IF;
  SELECT count(DISTINCT p.user_id) INTO quantidade
    FROM public.user_platform_roles p JOIN public.user_departamentos d ON d.user_id = p.user_id;
  IF quantidade > 0 THEN RAISE EXCEPTION 'Preflight: % usuários com plataforma e departamento; requer saneamento humano', quantidade; END IF;
  SELECT count(*) INTO quantidade FROM public.user_platform_roles p JOIN public.roles r ON r.id = p.role_id
    WHERE r.key = 'desenvolvedor' AND NOT EXISTS (SELECT 1 FROM public.user_platform_roles a JOIN public.roles ar ON ar.id = a.role_id WHERE a.user_id = p.user_id AND ar.key = 'admin');
  IF quantidade > 0 THEN RAISE EXCEPTION 'Preflight: % desenvolvedores sem papel admin correspondente; requer saneamento humano', quantidade; END IF;
  SELECT count(*) INTO quantidade FROM public.energy_efficiency_studies e
    WHERE (e.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.owner_id))
       OR (e.created_by_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.created_by_id))
       OR (e.approved_by_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.approved_by_id));
  IF quantidade > 0 THEN RAISE EXCEPTION 'Preflight: % estudos com autoria órfã; requer saneamento humano', quantidade; END IF;
  SELECT count(*) INTO quantidade FROM public.energy_invoice_type_approvals a
    WHERE a.approved_by_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.approved_by_id);
  IF quantidade > 0 THEN RAISE EXCEPTION 'Preflight: % aprovações com autoria órfã; requer saneamento humano', quantidade; END IF;
END $preflight$;

ALTER TABLE public.roles ADD CONSTRAINT roles_key_catalogo CHECK (key IN ('admin', 'desenvolvedor'));
CREATE FUNCTION plugga_security.telas_coerentes(p_departamento text, p_telas text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $2 IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest($2) t WHERE t IS NULL)
    AND cardinality($2) = (SELECT count(DISTINCT t) FROM unnest($2) t)
    AND coalesce($2 <@ CASE $1
      WHEN 'crm' THEN ARRAY['crm.pipelines', 'crm.clientes', 'crm.propostas', 'crm.contratos']
      WHEN 'energia-opm' THEN ARRAY['energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda']
      WHEN 'produto-tecnologia' THEN ARRAY['produto-tecnologia.pluggamob', 'produto-tecnologia.eletropostos', 'produto-tecnologia.recargas', 'produto-tecnologia.parceiros', 'produto-tecnologia.dashboards']
      WHEN 'financeiro' THEN ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']
      WHEN 'suprimentos' THEN ARRAY['suprimentos.compras', 'suprimentos.fornecedores', 'suprimentos.estoque']
      WHEN 'engenharia-obras' THEN ARRAY['engenharia-obras.obras', 'engenharia-obras.projetos', 'engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas', 'engenharia-obras.usinas', 'engenharia-obras.relatorios']
      WHEN 'marketing' THEN ARRAY['marketing.campanhas']
    END, false)
$fn$;
REVOKE ALL ON FUNCTION plugga_security.telas_coerentes(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.telas_coerentes(text, text[]) TO plugga_auth_runtime;
ALTER TABLE public.user_departamentos ADD CONSTRAINT user_departamentos_telas_coerentes
  CHECK (plugga_security.telas_coerentes(departamento, telas));

CREATE TABLE public.agent_identities (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  departamento TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  credential_expires_at TIMESTAMPTZ(6),
  revoked_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT agent_identities_user_id_departamento_key UNIQUE (user_id, departamento),
  CONSTRAINT agent_identities_membership_fkey FOREIGN KEY (user_id, departamento)
    REFERENCES public.user_departamentos(user_id, departamento)
    ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT agent_identities_credencial_coerente CHECK ((token_hash IS NULL) = (credential_expires_at IS NULL))
);
ALTER TABLE public.agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_identities FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_identities TO plugga_auth_runtime;
CREATE POLICY rls_auth ON public.agent_identities TO plugga_auth_runtime USING (true) WITH CHECK (true);
DO $agent_owner$
BEGIN
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.agent_identities FOR SELECT TO %I USING (true)', current_user);
END $agent_owner$;
ALTER TABLE public.agent_actions ADD COLUMN agent_user_id UUID;
ALTER TABLE public.agent_actions ADD CONSTRAINT agent_actions_agent_user_id_fkey
  FOREIGN KEY (agent_user_id) REFERENCES public.agent_identities(user_id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX agent_actions_agent_user_id_idx ON public.agent_actions(agent_user_id);

ALTER TABLE public.energy_efficiency_studies ADD CONSTRAINT energy_study_owner_fkey
  FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.energy_efficiency_studies ADD CONSTRAINT energy_study_creator_fkey
  FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.energy_efficiency_studies ADD CONSTRAINT energy_study_approver_fkey
  FOREIGN KEY (approved_by_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.energy_invoice_type_approvals ADD CONSTRAINT energy_invoice_approver_fkey
  FOREIGN KEY (approved_by_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Só o migrador pode assumir o dono. O trigger bloqueia users para serializar
-- concessões concorrentes, inclusive com FORCE RLS; runtime não herda este papel.
DO $owner$
BEGIN
  EXECUTE format('CREATE POLICY rls_consistencia_owner ON public.users FOR UPDATE TO %I USING (true) WITH CHECK (true)', current_user);
END $owner$;

CREATE FUNCTION plugga_security.bloquear_vinculos_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  PERFORM 1 FROM public.users WHERE id IN (
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END
  ) ORDER BY id FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE FUNCTION plugga_security.validar_vinculos_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE alvo uuid; identidade public.agent_identities;
BEGIN
  FOR alvo IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END
  ]) id WHERE id IS NOT NULL LOOP
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = alvo) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.user_platform_roles WHERE user_id = alvo)
       AND EXISTS (SELECT 1 FROM public.user_departamentos WHERE user_id = alvo) THEN
      RAISE EXCEPTION 'Papel de plataforma não admite concessão por departamento' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_platform_roles p JOIN public.roles r ON r.id = p.role_id WHERE p.user_id = alvo AND r.key = 'desenvolvedor')
       AND NOT EXISTS (SELECT 1 FROM public.user_platform_roles p JOIN public.roles r ON r.id = p.role_id WHERE p.user_id = alvo AND r.key = 'admin') THEN
      RAISE EXCEPTION 'Desenvolvedor requer também o papel admin' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO identidade FROM public.agent_identities WHERE user_id = alvo;
    IF FOUND THEN
      IF EXISTS (SELECT 1 FROM public.user_platform_roles WHERE user_id = alvo)
         OR (SELECT count(*) FROM public.user_departamentos WHERE user_id = alvo) <> 1
         OR NOT EXISTS (SELECT 1 FROM public.user_departamentos WHERE user_id = alvo AND departamento = identidade.departamento AND nivel = 'membro') THEN
        RAISE EXCEPTION 'Agente de IA deve ser membro do seu departamento' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.user_credentials WHERE user_id = alvo)
         OR EXISTS (SELECT 1 FROM public.user_identities WHERE user_id = alvo)
         OR EXISTS (SELECT 1 FROM public.sessions WHERE user_id = alvo)
         OR EXISTS (SELECT 1 FROM public.auth_tokens WHERE user_id = alvo) THEN
        RAISE EXCEPTION 'Identidade de IA não admite login ou convite humano' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION plugga_security.bloquear_vinculos_usuario(), plugga_security.validar_vinculos_usuario() FROM PUBLIC;

DO $triggers$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['user_platform_roles', 'user_departamentos', 'agent_identities'] LOOP
    EXECUTE format('CREATE TRIGGER vinculos_bloquear BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION plugga_security.bloquear_vinculos_usuario()', tabela);
    EXECUTE format('CREATE CONSTRAINT TRIGGER vinculos_coerentes AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION plugga_security.validar_vinculos_usuario()', tabela);
  END LOOP;
  -- Renovação/logout não criam vínculo humano novo. Não bloqueamos users
  -- nessas escritas: isso inverteria a ordem de locks de desativação/reset.
  FOREACH tabela IN ARRAY ARRAY['user_credentials', 'user_identities', 'sessions', 'auth_tokens'] LOOP
    EXECUTE format('CREATE TRIGGER vinculos_bloquear BEFORE INSERT OR UPDATE OF user_id ON public.%I FOR EACH ROW EXECUTE FUNCTION plugga_security.bloquear_vinculos_usuario()', tabela);
    EXECUTE format('CREATE CONSTRAINT TRIGGER vinculos_coerentes AFTER INSERT OR UPDATE OF user_id ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION plugga_security.validar_vinculos_usuario()', tabela);
  END LOOP;
END $triggers$;

CREATE FUNCTION plugga_security.preserva_chave_papel() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF OLD.key <> NEW.key THEN RAISE EXCEPTION 'Chave de papel é imutável' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION plugga_security.preserva_chave_papel() FROM PUBLIC;
CREATE TRIGGER roles_chave_imutavel BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION plugga_security.preserva_chave_papel();

COMMIT;
