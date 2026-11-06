BEGIN;

-- Logins e senhas são provisionados fora de migrations. O dono/migrador nunca
-- pode ser usado pela aplicação; FORCE RLS também se aplica ao dono das tabelas.
DO $roles$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['plugga_runtime', 'plugga_auth_runtime', 'plugga_jobs_runtime'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = papel) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', papel);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = papel AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
      RAISE EXCEPTION 'Grupo RLS com atributos inseguros: %', papel;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid = m.member WHERE r.rolname = papel) THEN
      RAISE EXCEPTION 'Grupo RLS não pode herdar outro papel: %', papel;
    END IF;
  END LOOP;
END $roles$;

CREATE SCHEMA plugga_security;
REVOKE ALL ON SCHEMA plugga_security FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public, plugga_security FROM plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
GRANT USAGE ON SCHEMA public, plugga_security TO plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;

-- Lista fechada: tabelas futuras não herdam políticas ou permissões permissivas.
DO $tables$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'users', 'user_credentials', 'user_identities', 'sessions', 'auth_tokens',
    'roles', 'companies', 'user_platform_roles', 'user_departamentos',
    'agent_actions', 'event_log', 'integrations', 'bitrix_mirror_records', 'job_runs',
    'ev_users', 'ev_segment_history', 'ev_contacts', 'partners', 'locations',
    'stations', 'connectors', 'ev_sessions', 'incidents', 'coupons', 'settlements',
    'settlement_lines', 'd14_credits', 'clients', 'client_contacts', 'pipelines',
    'pipeline_stages', 'pipeline_tags', 'pipeline_loss_reasons', 'pipeline_members',
    'deals', 'deal_tags', 'deal_consumer_units', 'deal_history', 'opportunities',
    'opportunity_contacts', 'contracts', 'consumer_units', 'market_migrations',
    'cycles', 'audits', 'contestations', 'energy_premise_versions',
    'energy_efficiency_studies', 'energy_invoice_type_approvals', 'llm_chamadas',
    'segredos_do_sistema', 'fornecedores', 'obras', 'obra_etapas_historico',
    'evidencias_de_obra', 'registros_epi', 'registros_apr', 'incidentes',
    'liberacoes_seguranca', 'pendencias_de_campo', 'medicoes_tecnicas',
    'projeto_versoes', 'pedidos_de_compra', 'itens_de_pedido',
    'pedidos_de_compra_etapas', 'cotacoes_de_compra', 'lead_documents',
    'lead_proposal_templates', 'lead_proposals', 'lead_proposal_versions',
    'lead_profiles', 'lead_contacts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    -- Helpers SECURITY DEFINER leem sem recursão, inclusive quando o migrador
    -- não é superuser. Esta policy não é concedida aos grupos runtime.
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
  END LOOP;
END $tables$;

CREATE FUNCTION plugga_security.usuario_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id FROM public.sessions s JOIN public.users u ON u.id = s.user_id
  WHERE s.token_hash = nullif(current_setting('plugga.session_hash', true), '')
    AND u.status = 'active' AND s.expires_at > statement_timestamp()
    AND s.absolute_expires_at > statement_timestamp()
  LIMIT 1
$fn$;

CREATE FUNCTION plugga_security.plataforma(tecnico boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_platform_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = plugga_security.usuario_id()
      AND (r.key = 'desenvolvedor' OR (NOT tecnico AND r.key = 'admin'))
  )
$fn$;

-- Tela e nível são avaliados na MESMA linha, nunca combinados entre deptos.
CREATE FUNCTION plugga_security.tem_tela(telas text[], gerente boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.plataforma() OR EXISTS (
    SELECT 1 FROM public.user_departamentos d
    WHERE d.user_id = plugga_security.usuario_id()
      AND (NOT $2 OR d.nivel = 'gerente')
      -- Parâmetro posicional: "telas" também é coluna de user_departamentos.
      AND EXISTS (SELECT 1 FROM unnest($1) t(tela)
        WHERE t.tela = ANY(d.telas) AND split_part(t.tela, '.', 1) = d.departamento)
  )
$fn$;

CREATE FUNCTION plugga_security.registro(dono uuid, telas text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.tem_tela(telas, true)
    OR (dono = plugga_security.usuario_id() AND plugga_security.tem_tela(telas))
$fn$;

CREATE FUNCTION plugga_security.diretorio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT alvo = plugga_security.usuario_id() OR plugga_security.plataforma() OR EXISTS (
    SELECT 1 FROM public.user_departamentos gestor
    JOIN public.user_departamentos equipe ON equipe.departamento = gestor.departamento
    WHERE gestor.user_id = plugga_security.usuario_id() AND equipe.user_id = alvo
      AND gestor.nivel = 'gerente'
      AND EXISTS (SELECT 1 FROM unnest(gestor.telas) t(tela) WHERE split_part(t.tela, '.', 1) = gestor.departamento)
  )
$fn$;

CREATE FUNCTION plugga_security.negocio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = alvo
    AND plugga_security.registro(d.owner_id, ARRAY['crm.pipelines']))
$fn$;

CREATE FUNCTION plugga_security.cliente(alvo uuid, escrita boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = alvo
    AND plugga_security.registro(c.owner_id, CASE WHEN escrita THEN ARRAY['crm.clientes'] ELSE
      ARRAY['crm.clientes', 'crm.pipelines', 'energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda'] END))
$fn$;

CREATE FUNCTION plugga_security.cliente_do_pipeline(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = alvo
    AND plugga_security.registro(c.owner_id, ARRAY['crm.pipelines']))
$fn$;

CREATE FUNCTION plugga_security.vinculos_negocio(p_pipeline uuid, p_etapa uuid, p_cliente uuid, p_contato uuid, p_motivo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.pipeline_stages e WHERE e.id = p_etapa AND e.pipeline_id = p_pipeline)
    AND (p_cliente IS NULL OR plugga_security.cliente_do_pipeline(p_cliente))
    AND (p_contato IS NULL OR EXISTS (SELECT 1 FROM public.client_contacts c WHERE c.id = p_contato AND c.client_id = p_cliente))
    AND (p_motivo IS NULL OR EXISTS (SELECT 1 FROM public.pipeline_loss_reasons m WHERE m.id = p_motivo AND m.pipeline_id = p_pipeline))
$fn$;

-- Execução de fatura não concede acesso ao catálogo técnico nem à tela da chave.
CREATE FUNCTION plugga_security.modo_integracao(chave text) RETURNS public.integration_mode
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT i.mode FROM public.integrations i WHERE i.key = $1
    AND (plugga_security.plataforma() OR ($1 = 'openrouter' AND plugga_security.tem_tela(
      ARRAY['crm.pipelines', 'energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.demanda'])))
$fn$;

CREATE FUNCTION plugga_security.chave_fatura() RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  WHERE s.chave = 'openrouter.api_key' AND plugga_security.tem_tela(
    ARRAY['crm.pipelines', 'energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.demanda'])
$fn$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA plugga_security FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA plugga_security TO plugga_runtime;

-- Bootstrap/login/gestão de acesso tem pool próprio e nenhuma tabela de negócio.
DO $auth$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['users', 'user_credentials', 'user_identities', 'sessions', 'auth_tokens', 'roles', 'user_platform_roles', 'user_departamentos'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO plugga_auth_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_auth ON public.%I TO plugga_auth_runtime USING (true) WITH CHECK (true)', tabela);
  END LOOP;
END $auth$;

GRANT SELECT ON public.users, public.roles, public.user_platform_roles, public.user_departamentos TO plugga_runtime;
CREATE POLICY rls_diretorio ON public.users FOR SELECT TO plugga_runtime USING (plugga_security.diretorio(id));
CREATE POLICY rls_papeis_usuario ON public.user_platform_roles FOR SELECT TO plugga_runtime USING (plugga_security.diretorio(user_id));
CREATE POLICY rls_departamentos_usuario ON public.user_departamentos FOR SELECT TO plugga_runtime USING (plugga_security.diretorio(user_id));

-- Exceções explícitas de catálogo: só leitura com sessão ativa.
DO $catalogos$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['roles', 'companies', 'lead_proposal_templates'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO plugga_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_catalogo ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.usuario_id() IS NOT NULL)', tabela);
  END LOOP;
END $catalogos$;

-- Tabelas com ownership: SELECT e DML têm telas independentes.
DO $registros$
DECLARE regra record; comando text; predicado text; checagem text;
BEGIN
  FOR regra IN SELECT * FROM (VALUES
    ('clients', ARRAY['crm.clientes', 'crm.pipelines', 'energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda'], ARRAY['crm.clientes']),
    ('opportunities', ARRAY['crm.pipelines', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], ARRAY['crm.pipelines']),
    ('contracts', ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], ARRAY['crm.contratos']),
    ('deals', ARRAY['crm.pipelines'], ARRAY['crm.pipelines'])
  ) AS r(tabela, leitura, escrita) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO plugga_runtime', regra.tabela);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.registro(owner_id, %L::text[]))', regra.tabela, regra.leitura);
    FOREACH comando IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      predicado := format('plugga_security.registro(owner_id, %L::text[])', regra.escrita);
      -- Conversão do lead cria cliente próprio na mesma transação.
      IF regra.tabela = 'clients' AND comando = 'INSERT' THEN
        predicado := '(' || predicado || ' OR plugga_security.registro(owner_id, ARRAY[''crm.pipelines'']))';
      END IF;
      checagem := predicado;
      IF regra.tabela = 'deals' THEN
        checagem := '(' || predicado || ' AND plugga_security.vinculos_negocio(pipeline_id, stage_id, client_id, contact_id, loss_reason_id))';
      END IF;
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO plugga_runtime %s %s',
        'rls_' || lower(comando), regra.tabela, comando,
        CASE WHEN comando <> 'INSERT' THEN 'USING (' || predicado || ')' ELSE '' END,
        CASE WHEN comando <> 'DELETE' THEN 'WITH CHECK (' || checagem || ')' ELSE '' END);
    END LOOP;
  END LOOP;
END $registros$;

DO $filhos$
DECLARE regra record;
BEGIN
  FOR regra IN SELECT * FROM (VALUES
    ('client_contacts', 'plugga_security.cliente(client_id)', 'plugga_security.cliente(client_id, true)'),
    ('opportunity_contacts', 'EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id)', 'EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id AND plugga_security.registro(o.owner_id, ARRAY[''crm.pipelines'']))'),
    ('deal_tags', 'plugga_security.negocio(deal_id)', 'EXISTS (SELECT 1 FROM public.deals d JOIN public.pipeline_tags t ON t.pipeline_id = d.pipeline_id WHERE d.id = deal_id AND t.id = tag_id)'),
    ('deal_consumer_units', 'plugga_security.negocio(deal_id)', 'EXISTS (SELECT 1 FROM public.deals d JOIN public.consumer_units u ON u.client_id = d.client_id WHERE d.id = deal_id AND u.id = consumer_unit_id)'),
    ('deal_history', 'plugga_security.negocio(deal_id)', 'plugga_security.negocio(deal_id)'),
    ('lead_documents', 'plugga_security.negocio(deal_id)', 'plugga_security.negocio(deal_id)'),
    ('lead_proposals', 'plugga_security.negocio(deal_id)', 'plugga_security.negocio(deal_id)'),
    ('lead_proposal_versions', 'EXISTS (SELECT 1 FROM public.lead_proposals p WHERE p.id = proposal_id)', 'EXISTS (SELECT 1 FROM public.lead_proposals p JOIN public.lead_documents d ON d.deal_id = p.deal_id WHERE p.id = proposal_id AND d.id = document_id)'),
    ('lead_profiles', 'plugga_security.negocio(deal_id)', 'plugga_security.negocio(deal_id)'),
    ('lead_contacts', 'plugga_security.negocio(deal_id)', 'plugga_security.negocio(deal_id)')
  ) AS r(tabela, leitura, escrita) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO plugga_runtime', regra.tabela);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (%s)', regra.tabela, regra.leitura);
    EXECUTE format('CREATE POLICY rls_inserir ON public.%I FOR INSERT TO plugga_runtime WITH CHECK (%s)', regra.tabela, regra.escrita);
    EXECUTE format('CREATE POLICY rls_atualizar ON public.%I FOR UPDATE TO plugga_runtime USING (%s) WITH CHECK (%s)', regra.tabela, regra.escrita, regra.escrita);
    EXECUTE format('CREATE POLICY rls_apagar ON public.%I FOR DELETE TO plugga_runtime USING (%s)', regra.tabela, regra.escrita);
  END LOOP;
END $filhos$;

-- Conversão cria os contatos do cliente; edição/exclusão ainda exige Clientes.
CREATE POLICY rls_contato_converter ON public.client_contacts FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.cliente_do_pipeline(client_id));

DO $pipelines$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['pipelines', 'pipeline_stages', 'pipeline_tags', 'pipeline_loss_reasons'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO plugga_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.tem_tela(ARRAY[''crm.pipelines'']))', tabela);
    EXECUTE format('CREATE POLICY rls_configurar ON public.%I TO plugga_runtime USING (plugga_security.tem_tela(ARRAY[''crm.pipelines''], true)) WITH CHECK (plugga_security.tem_tela(ARRAY[''crm.pipelines''], true))', tabela);
  END LOOP;
END $pipelines$;

-- Membro só vê a própria participação, para não expor IDs alheios nem quebrar
-- include obrigatório de users (que também é restrito pelo diretório).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_members TO plugga_runtime;
CREATE POLICY rls_membro_ler ON public.pipeline_members FOR SELECT TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['crm.pipelines'], true)
    OR (user_id = plugga_security.usuario_id() AND plugga_security.tem_tela(ARRAY['crm.pipelines'])));
CREATE POLICY rls_membro_configurar ON public.pipeline_members TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['crm.pipelines'], true))
  WITH CHECK (plugga_security.tem_tela(ARRAY['crm.pipelines'], true));

-- Opções do pipeline precisam ler as UCs do cliente acessível. Não abre DML.
CREATE POLICY rls_uc_pipeline ON public.consumer_units FOR SELECT TO plugga_runtime
  USING (plugga_security.cliente_do_pipeline(client_id));

GRANT SELECT, INSERT ON public.event_log TO plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
CREATE POLICY rls_evento_ler ON public.event_log FOR SELECT TO plugga_runtime USING (plugga_security.plataforma(true));
CREATE POLICY rls_evento_inserir ON public.event_log FOR INSERT TO plugga_runtime WITH CHECK (actor_type = 'user' AND actor_id = plugga_security.usuario_id()::text);
CREATE POLICY rls_evento_auth_ler ON public.event_log FOR SELECT TO plugga_auth_runtime USING (true);
CREATE POLICY rls_evento_auth_inserir ON public.event_log FOR INSERT TO plugga_auth_runtime WITH CHECK (true);
CREATE POLICY rls_evento_job_ler ON public.event_log FOR SELECT TO plugga_jobs_runtime USING (actor_type = 'system');
CREATE POLICY rls_evento_job_inserir ON public.event_log FOR INSERT TO plugga_jobs_runtime WITH CHECK (actor_type = 'system' AND actor_id IS NULL);

DO $tecnico$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['integrations', 'bitrix_mirror_records', 'job_runs'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO plugga_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_jobs ON public.%I TO plugga_jobs_runtime USING (true) WITH CHECK (true)', tabela);
    EXECUTE format('CREATE POLICY rls_plataforma ON public.%I TO plugga_runtime USING (plugga_security.plataforma(%L)) WITH CHECK (plugga_security.plataforma(%L))', tabela, tabela = 'job_runs', tabela = 'job_runs');
  END LOOP;
END $tecnico$;

GRANT SELECT ON public.agent_actions TO plugga_runtime;
CREATE POLICY rls_agentes_tecnico ON public.agent_actions FOR SELECT TO plugga_runtime USING (plugga_security.plataforma(true));
GRANT SELECT, INSERT ON public.llm_chamadas TO plugga_runtime;
CREATE POLICY rls_llm_ler ON public.llm_chamadas FOR SELECT TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true));
CREATE POLICY rls_llm_inserir ON public.llm_chamadas FOR INSERT TO plugga_runtime
  WITH CHECK (processo = 'fatura.visao' AND plugga_security.tem_tela(ARRAY['crm.pipelines', 'energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.demanda']));

-- Domínios sem API ativa: apenas plataforma até existir regra específica de
-- ownership. Empresa é etiqueta de negócio; não é tenant nem fronteira RLS.
DO $plataforma$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'ev_users', 'ev_segment_history', 'ev_contacts', 'partners', 'locations',
    'stations', 'connectors', 'ev_sessions', 'incidents', 'coupons', 'settlements',
    'settlement_lines', 'd14_credits', 'consumer_units', 'market_migrations',
    'cycles', 'audits', 'contestations', 'energy_premise_versions',
    'energy_efficiency_studies', 'energy_invoice_type_approvals', 'segredos_do_sistema',
    'fornecedores', 'obras', 'obra_etapas_historico', 'evidencias_de_obra',
    'registros_epi', 'registros_apr', 'incidentes', 'liberacoes_seguranca',
    'pendencias_de_campo', 'medicoes_tecnicas', 'projeto_versoes',
    'pedidos_de_compra', 'itens_de_pedido', 'pedidos_de_compra_etapas', 'cotacoes_de_compra'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO plugga_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_plataforma ON public.%I TO plugga_runtime USING (plugga_security.plataforma()) WITH CHECK (plugga_security.plataforma())', tabela);
  END LOOP;
END $plataforma$;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO plugga_runtime;
COMMIT;
