BEGIN;

-- A tela autoriza o registro; responsável/autoria são metadados, não uma fronteira de acesso.
CREATE OR REPLACE FUNCTION plugga_security.registro(dono uuid, telas text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT plugga_security.tem_tela($2) $fn$;

CREATE OR REPLACE FUNCTION plugga_security.cliente(alvo uuid, escrita boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.tem_tela(ARRAY['crm.clientes'])
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = $1)
$fn$;
CREATE OR REPLACE FUNCTION plugga_security.cliente_do_pipeline(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT plugga_security.cliente($1) $fn$;

DROP POLICY rls_cliente_contrato ON public.clients;
ALTER POLICY rls_ler ON public.clients USING (plugga_security.tem_tela(ARRAY['crm.clientes']));
ALTER POLICY rls_insert ON public.clients WITH CHECK (plugga_security.tem_tela(ARRAY['crm.clientes']));
ALTER POLICY rls_update ON public.clients USING (plugga_security.tem_tela(ARRAY['crm.clientes']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['crm.clientes']));
ALTER POLICY rls_delete ON public.clients USING (plugga_security.tem_tela(ARRAY['crm.clientes']));
DROP POLICY rls_contato_converter ON public.client_contacts;
ALTER POLICY rls_uc_pipeline ON public.consumer_units USING (
  plugga_security.tem_tela(ARRAY['crm.pipelines']) AND plugga_security.cliente(client_id)
);
ALTER POLICY rls_ler ON public.deal_consumer_units USING (
  plugga_security.tem_tela(ARRAY['crm.clientes']) AND plugga_security.negocio(deal_id)
);

-- Contratos autorizam somente a projeção do cliente relacionado, nunca seu cadastro completo.
CREATE OR REPLACE FUNCTION plugga_security.cliente_para_contrato(alvo uuid, escrita boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE WHEN $2 THEN plugga_security.tem_tela(ARRAY['crm.contratos'])
      AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = $1)
    ELSE plugga_security.tem_tela(ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
      AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.client_id = $1)
    END
$fn$;
CREATE OR REPLACE FUNCTION plugga_security.oportunidade_para_contrato(alvo uuid, cliente uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.tem_tela(ARRAY['crm.pipelines', 'crm.contratos'])
    AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = $1 AND (o.client_id IS NULL OR o.client_id = $2))
$fn$;
CREATE FUNCTION plugga_security.clientes_dos_contratos(alvos uuid[])
RETURNS TABLE(contract_id uuid, id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT contrato.id, cliente.id, cliente.name FROM public.contracts contrato
  JOIN public.clients cliente ON cliente.id = contrato.client_id
  WHERE contrato.id = ANY($1) AND plugga_security.tem_tela(
    ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
$fn$;
REVOKE ALL ON FUNCTION plugga_security.clientes_dos_contratos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.clientes_dos_contratos(uuid[]) TO plugga_runtime;

ALTER POLICY rls_ler ON public.contracts USING (plugga_security.tem_tela(
  ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
ALTER POLICY rls_insert ON public.contracts WITH CHECK (
  plugga_security.tem_tela(ARRAY['crm.contratos']) AND plugga_security.cliente_para_contrato(client_id, true)
  AND (opportunity_id IS NULL OR plugga_security.oportunidade_para_contrato(opportunity_id, client_id))
);
ALTER POLICY rls_update ON public.contracts USING (plugga_security.tem_tela(ARRAY['crm.contratos'])) WITH CHECK (
  plugga_security.tem_tela(ARRAY['crm.contratos']) AND plugga_security.cliente_para_contrato(client_id, true)
  AND (opportunity_id IS NULL OR plugga_security.oportunidade_para_contrato(opportunity_id, client_id))
);
ALTER POLICY rls_delete ON public.contracts USING (plugga_security.tem_tela(ARRAY['crm.contratos']));

-- O trigger abaixo preserva vínculos de quem não tem Clientes. Só a RPC pode criar um novo nessa condição.
CREATE OR REPLACE FUNCTION plugga_security.vinculos_negocio(p_pipeline uuid, p_etapa uuid, p_cliente uuid, p_contato uuid, p_motivo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.pipeline_stages e WHERE e.id = p_etapa AND e.pipeline_id = p_pipeline)
    AND (p_motivo IS NULL OR EXISTS (SELECT 1 FROM public.pipeline_loss_reasons m WHERE m.id = p_motivo AND m.pipeline_id = p_pipeline))
    AND (NOT plugga_security.tem_tela(ARRAY['crm.clientes']) OR (
      (p_cliente IS NULL OR plugga_security.cliente(p_cliente))
      AND (p_contato IS NULL OR EXISTS (SELECT 1 FROM public.client_contacts c WHERE c.id = p_contato AND c.client_id = p_cliente))
    ))
$fn$;
ALTER POLICY rls_insert ON public.opportunities WITH CHECK (
  plugga_security.tem_tela(ARRAY['crm.pipelines'])
  AND (NOT plugga_security.tem_tela(ARRAY['crm.clientes']) OR client_id IS NULL OR plugga_security.cliente(client_id))
);
ALTER POLICY rls_update ON public.opportunities USING (plugga_security.tem_tela(ARRAY['crm.pipelines'])) WITH CHECK (
  plugga_security.tem_tela(ARRAY['crm.pipelines'])
  AND (NOT plugga_security.tem_tela(ARRAY['crm.clientes']) OR client_id IS NULL OR plugga_security.cliente(client_id))
);
ALTER POLICY rls_membro_ler ON public.pipeline_members USING (plugga_security.tem_tela(ARRAY['crm.pipelines']));

-- Nomes e status necessários para atribuição/histórico não concedem e-mail nem os demais dados da conta.
REVOKE SELECT ON public.users FROM plugga_runtime;
GRANT SELECT(id, name, status) ON public.users TO plugga_runtime;
CREATE OR REPLACE FUNCTION plugga_security.diretorio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $1 = plugga_security.usuario_id() OR plugga_security.plataforma()
    OR (plugga_security.tem_tela(ARRAY['crm.pipelines']) AND (
      EXISTS (SELECT 1 FROM public.deals d WHERE d.owner_id = $1 OR d.created_by_id = $1)
      OR EXISTS (SELECT 1 FROM public.deal_history h WHERE h.actor_id = $1)
      OR EXISTS (SELECT 1 FROM public.pipeline_members m WHERE m.user_id = $1)
      OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.owner_id = $1)
    ))
    OR (plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.owner_id = $1))
    OR (plugga_security.tem_tela(ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
      AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.owner_id = $1))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active') AND (
      (plugga_security.tem_tela(ARRAY['crm.clientes', 'crm.pipelines', 'crm.contratos'])
        AND EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = $1))
      OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = $1 AND d.departamento = 'crm'
        AND EXISTS (SELECT 1 FROM unnest(d.telas) t(tela)
          WHERE t.tela IN ('crm.clientes', 'crm.pipelines', 'crm.contratos') AND plugga_security.tem_tela(ARRAY[t.tela])))
    ))
$fn$;

CREATE OR REPLACE FUNCTION plugga_security.entidade_do_agente(tipo text, alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE $1
    WHEN 'client' THEN plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id::text = $2)
    WHEN 'deal' THEN plugga_security.tem_tela(ARRAY['crm.pipelines']) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id::text = $2)
    WHEN 'opportunity' THEN plugga_security.tem_tela(ARRAY['crm.pipelines']) AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id::text = $2)
    WHEN 'contract' THEN plugga_security.tem_tela(ARRAY['crm.contratos']) AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.id::text = $2)
    ELSE false END
$fn$;

-- As funções de normalização só recebem valores; não consultam cadastros.
CREATE FUNCTION plugga_security.telefone_normalizado(valor text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE WHEN length(digitos) IN (12, 13) AND left(digitos, 2) = '55' THEN substr(digitos, 3) ELSE digitos END
  FROM (SELECT regexp_replace(coalesce($1, ''), '[^0-9]', '', 'g') AS digitos) d
$fn$;
CREATE FUNCTION plugga_security.nome_normalizado(valor text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(pg_catalog.normalize(lower(coalesce($1, '')), 'NFD'),
    U&'[\0300-\036f]', '', 'g'), '[^a-z0-9[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.telefone_normalizado(text), plugga_security.nome_normalizado(text) FROM PUBLIC;

DROP FUNCTION IF EXISTS plugga_security.converter_lead_snapshot(uuid);
DROP FUNCTION IF EXISTS plugga_security.converter_lead_snapshot(uuid, boolean);
CREATE FUNCTION plugga_security.converter_lead_snapshot(alvo uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  ator uuid;
  tipo_ator public.actor_type;
  pipeline_inicial uuid;
  negocio public.deals%ROWTYPE;
  perfil public.lead_profiles%ROWTYPE;
  cliente uuid;
  telefone text;
  nome text;
  criado boolean := false;
BEGIN
  ator := plugga_security.usuario_id();
  IF ator IS NULL OR NOT plugga_security.tem_tela(ARRAY['crm.pipelines']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CONVERSAO_NAO_AUTORIZADA';
  END IF;
  SELECT d.pipeline_id INTO pipeline_inicial FROM public.deals d WHERE d.id = $1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'LEAD_NAO_ENCONTRADO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('plugga:pipeline:' || pipeline_inicial::text, 0));
  SELECT d.* INTO negocio FROM public.deals d WHERE d.id = $1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'LEAD_NAO_ENCONTRADO'; END IF;
  IF negocio.pipeline_id <> pipeline_inicial THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'LEAD_ALTERADO_DURANTE_CONVERSAO';
  END IF;
  ator := plugga_security.usuario_id();
  IF ator IS NULL OR NOT plugga_security.tem_tela(ARRAY['crm.pipelines']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CONVERSAO_NAO_AUTORIZADA';
  END IF;
  IF negocio.status = 'lost' THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONVERSAO_LEAD_PERDIDO'; END IF;
  IF negocio.client_id IS NOT NULL THEN
    RETURN CASE WHEN plugga_security.tem_tela(ARRAY['crm.clientes']) THEN false ELSE NULL END;
  END IF;
  SELECT p.* INTO perfil FROM public.lead_profiles p WHERE p.deal_id = $1;
  IF NOT FOUND OR nullif(btrim(perfil.name), '') IS NULL
    OR coalesce(nullif(btrim(perfil.phone), ''), nullif(btrim(perfil.email), ''), nullif(btrim(perfil.document), '')) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONVERSAO_LEAD_INCOMPLETO';
  END IF;

  IF perfil.document IS NOT NULL THEN
    SELECT c.id INTO cliente FROM public.clients c WHERE c.document = perfil.document;
  ELSE
    telefone := plugga_security.telefone_normalizado(perfil.phone);
    nome := plugga_security.nome_normalizado(perfil.name);
    -- Clientes já autoriza INSERT; sua API mantém a confirmação de possíveis duplicatas.
    IF NOT plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (SELECT 1 FROM public.clients c WHERE
      (perfil.email IS NOT NULL AND (lower(c.email) = lower(perfil.email)
        OR EXISTS (SELECT 1 FROM public.client_contacts cc WHERE cc.client_id = c.id AND lower(cc.email) = lower(perfil.email))))
      OR (length(telefone) >= 8 AND (plugga_security.telefone_normalizado(c.phone) = telefone
        OR EXISTS (SELECT 1 FROM public.client_contacts cc WHERE cc.client_id = c.id AND plugga_security.telefone_normalizado(cc.phone) = telefone)))
      OR (length(split_part(nome, ' ', 1)) >= 3 AND c.name ILIKE '%' || split_part(nome, ' ', 1) || '%'
        AND (plugga_security.nome_normalizado(c.name) LIKE '%' || nome || '%'
          OR nome LIKE '%' || plugga_security.nome_normalizado(c.name) || '%'))
    ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONVERSAO_REQUER_CLIENTES'; END IF;
  END IF;
  IF cliente IS NULL THEN
    INSERT INTO public.clients(person_type, name, legal_name, document, phone, email, postal_code, street,
      address_complement, district, city, state, origin, notes, owner_id, updated_at)
    VALUES (perfil.person_type, perfil.name, perfil.legal_name, perfil.document, perfil.phone, perfil.email,
      perfil.postal_code, perfil.street, perfil.address_complement, perfil.district, perfil.city, perfil.state,
      perfil.origin, perfil.notes, negocio.owner_id, statement_timestamp())
    ON CONFLICT (document) DO NOTHING RETURNING id INTO cliente;
    IF cliente IS NULL THEN
      SELECT c.id INTO cliente FROM public.clients c WHERE c.document = perfil.document;
      IF cliente IS NULL THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONVERSAO_CONCORRENTE'; END IF;
    ELSE
      criado := true;
      INSERT INTO public.client_contacts(client_id, name, job_title, role, phone, phone_is_whatsapp, email, is_primary, cpf, rg, updated_at)
      SELECT cliente, c.name, c.job_title, c.role, c.phone, c.phone_is_whatsapp, c.email, c.is_primary, c.cpf, c.rg, statement_timestamp()
      FROM public.lead_contacts c WHERE c.deal_id = $1;
    END IF;
  END IF;
  UPDATE public.deals SET client_id = cliente, updated_at = statement_timestamp() WHERE id = $1;
  INSERT INTO public.deal_history(deal_id, kind, actor_id) VALUES ($1, 'client_converted', ator);
  IF plugga_security.agente_id() IS NULL THEN tipo_ator := 'user'; ELSE tipo_ator := 'agent'; END IF;
  INSERT INTO public.event_log(event_name, entity_type, entity_id, actor_type, actor_id, payload, occurred_at)
  VALUES ('commercial.deal.client_converted', 'deal', $1::text, tipo_ator, ator::text, '{}'::jsonb, statement_timestamp());
  RETURN CASE WHEN plugga_security.tem_tela(ARRAY['crm.clientes']) THEN criado ELSE NULL END;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.converter_lead_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.converter_lead_snapshot(uuid) TO plugga_runtime;

-- FORCE RLS também vale para o dono. Só seu papel confiável, nunca runtime/auth/jobs, recebe estas policies.
DO $conversao$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['clients', 'client_contacts', 'deal_history', 'event_log'] LOOP
    EXECUTE format('CREATE POLICY rls_conversao_owner_insert ON public.%I FOR INSERT TO %I WITH CHECK (true)', tabela, current_user);
  END LOOP;
  EXECUTE format('CREATE POLICY rls_conversao_owner_update ON public.deals FOR UPDATE TO %I USING (true) WITH CHECK (true)', current_user);
END $conversao$;

-- SECURITY INVOKER é essencial: current_user deve distinguir runtime da chamada à RPC definer.
CREATE FUNCTION plugga_security.validar_escrita_crm() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE tela text; mudanca_de_dono boolean;
BEGIN
  IF current_user = pg_get_userbyid((SELECT p.proowner FROM pg_proc p WHERE p.oid = 'plugga_security.converter_lead_snapshot(uuid)'::regprocedure))
    OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND r.rolsuper) THEN RETURN NEW; END IF;
  IF plugga_security.usuario_id() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ESCRITA_NAO_AUTORIZADA'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'IDENTIDADE_IMUTAVEL';
  END IF;
  IF TG_TABLE_NAME = 'contracts' THEN
    IF ((TG_OP = 'INSERT' AND NEW.opportunity_id IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id))
      AND NOT plugga_security.tem_tela(ARRAY['crm.pipelines']) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'VINCULO_OPORTUNIDADE_REQUER_PIPELINES';
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('deals', 'opportunities') AND NOT plugga_security.tem_tela(ARRAY['crm.clientes']) THEN
    IF (TG_OP = 'INSERT' AND NEW.client_id IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'VINCULO_REQUER_CLIENTES';
    END IF;
    IF TG_TABLE_NAME = 'deals' THEN
      IF (TG_OP = 'INSERT' AND NEW.contact_id IS NOT NULL)
        OR (TG_OP = 'UPDATE' AND NEW.contact_id IS DISTINCT FROM OLD.contact_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'VINCULO_REQUER_CLIENTES';
      END IF;
    END IF;
  END IF;
  tela := CASE TG_TABLE_NAME WHEN 'clients' THEN 'crm.clientes' WHEN 'contracts' THEN 'crm.contratos' ELSE 'crm.pipelines' END;
  mudanca_de_dono := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN mudanca_de_dono := NEW.owner_id IS DISTINCT FROM OLD.owner_id; END IF;
  IF mudanca_de_dono AND NEW.owner_id IS NOT NULL THEN
    IF NEW.owner_id <> plugga_security.usuario_id() AND NOT plugga_security.tem_tela(ARRAY[tela], true) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATRIBUICAO_REQUER_GESTAO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.owner_id AND u.status = 'active' AND (
      EXISTS (SELECT 1 FROM public.user_platform_roles p JOIN public.roles r ON r.id = p.role_id
        WHERE p.user_id = u.id AND r.key IN ('admin', 'desenvolvedor'))
      OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'crm' AND tela = ANY(d.telas))
    )) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESPONSAVEL_INELEGIVEL'; END IF;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.validar_escrita_crm() FROM PUBLIC;
CREATE TRIGGER validar_escrita_crm BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION plugga_security.validar_escrita_crm();
CREATE TRIGGER validar_escrita_crm BEFORE INSERT OR UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION plugga_security.validar_escrita_crm();
CREATE TRIGGER validar_escrita_crm BEFORE INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION plugga_security.validar_escrita_crm();
CREATE TRIGGER validar_escrita_crm BEFORE INSERT OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION plugga_security.validar_escrita_crm();

COMMIT;
