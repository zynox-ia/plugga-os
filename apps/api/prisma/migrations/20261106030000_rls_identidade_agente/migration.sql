BEGIN;

CREATE FUNCTION plugga_security.agente_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id FROM public.agent_identities a
  JOIN public.users u ON u.id = a.user_id
  JOIN public.user_departamentos d ON d.user_id = a.user_id AND d.departamento = a.departamento
  WHERE a.token_hash = nullif(current_setting('plugga.agent_hash', true), '')
    AND nullif(current_setting('plugga.session_hash', true), '') IS NULL
    AND a.revoked_at IS NULL AND a.credential_expires_at > statement_timestamp()
    AND u.status = 'active' AND d.nivel = 'membro'
    AND NOT EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_departamentos outro WHERE outro.user_id = u.id AND outro.departamento <> a.departamento)
  LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION plugga_security.usuario_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT coalesce(plugga_security.agente_id(), (
    SELECT u.id FROM public.sessions s JOIN public.users u ON u.id = s.user_id
    WHERE s.token_hash = nullif(current_setting('plugga.session_hash', true), '')
      AND nullif(current_setting('plugga.agent_hash', true), '') IS NULL
      AND u.status = 'active' AND s.expires_at > statement_timestamp()
      AND s.absolute_expires_at > statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM public.agent_identities a WHERE a.user_id = u.id)
    LIMIT 1
  ))
$fn$;

CREATE FUNCTION plugga_security.entidade_do_agente(tipo text, alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE $1
    WHEN 'client' THEN plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (
      SELECT 1 FROM public.clients c WHERE c.id::text = $2 AND c.owner_id = plugga_security.agente_id())
    WHEN 'deal' THEN plugga_security.tem_tela(ARRAY['crm.pipelines']) AND EXISTS (
      SELECT 1 FROM public.deals d WHERE d.id::text = $2 AND d.owner_id = plugga_security.agente_id())
    WHEN 'opportunity' THEN plugga_security.tem_tela(ARRAY['crm.pipelines']) AND EXISTS (
      SELECT 1 FROM public.opportunities o WHERE o.id::text = $2 AND o.owner_id = plugga_security.agente_id())
    WHEN 'contract' THEN plugga_security.tem_tela(ARRAY['crm.contratos']) AND EXISTS (
      SELECT 1 FROM public.contracts c WHERE c.id::text = $2 AND c.owner_id = plugga_security.agente_id())
    ELSE false
  END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.agente_id(), plugga_security.entidade_do_agente(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.agente_id(), plugga_security.entidade_do_agente(text, text) TO plugga_runtime;

-- A identidade de IA é a mesma dona dos registros, sem bypass ou papel de plataforma.
DROP POLICY rls_evento_inserir ON public.event_log;
CREATE POLICY rls_evento_inserir ON public.event_log FOR INSERT TO plugga_runtime WITH CHECK (
  actor_id = plugga_security.usuario_id()::text AND (
    (actor_type = 'user' AND plugga_security.agente_id() IS NULL)
    OR (actor_type = 'agent' AND plugga_security.agente_id() IS NOT NULL)
  )
);

GRANT INSERT ON public.agent_actions TO plugga_runtime;
CREATE POLICY rls_agente_ler ON public.agent_actions FOR SELECT TO plugga_runtime USING (
  agent_user_id = plugga_security.agente_id() AND plugga_security.entidade_do_agente(entity_type, entity_id)
);
CREATE POLICY rls_agente_inserir ON public.agent_actions FOR INSERT TO plugga_runtime WITH CHECK (
  agent_user_id = plugga_security.agente_id() AND agent = plugga_security.agente_id()::text
  AND requested_by IS NULL AND approval_status IN ('not_required', 'pending')
  AND plugga_security.entidade_do_agente(entity_type, entity_id)
);

COMMIT;
