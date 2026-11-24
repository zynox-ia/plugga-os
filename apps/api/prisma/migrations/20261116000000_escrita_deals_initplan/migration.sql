BEGIN;

-- Mesma semântica de rls_update/WITH CHECK: registro(owner_id, telas) só
-- consulta tem_tela(telas), e vinculos_negocio só usa tem_tela(crm.clientes)
-- como chave. As duas consultas de acesso viram InitPlan (uma por comando);
-- a verificação de etapa, motivo, cliente e contato continua por linha.
CREATE FUNCTION plugga_security.vinculos_negocio_dados(
  p_pipeline uuid, p_etapa uuid, p_cliente uuid, p_contato uuid, p_motivo uuid, p_com_clientes boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.pipeline_stages e WHERE e.id = p_etapa AND e.pipeline_id = p_pipeline)
    AND (p_motivo IS NULL OR EXISTS (SELECT 1 FROM public.pipeline_loss_reasons m WHERE m.id = p_motivo AND m.pipeline_id = p_pipeline))
    AND (NOT p_com_clientes OR (
      (p_cliente IS NULL OR plugga_security.cliente(p_cliente))
      AND (p_contato IS NULL OR EXISTS (SELECT 1 FROM public.client_contacts c WHERE c.id = p_contato AND c.client_id = p_cliente))
    ))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.vinculos_negocio_dados(uuid, uuid, uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.vinculos_negocio_dados(uuid, uuid, uuid, uuid, uuid, boolean) TO plugga_runtime;

ALTER POLICY rls_update ON public.deals WITH CHECK (
  (SELECT plugga_security.tem_tela(ARRAY['crm.pipelines']))
  AND plugga_security.vinculos_negocio_dados(pipeline_id, stage_id, client_id, contact_id, loss_reason_id,
    (SELECT plugga_security.tem_tela(ARRAY['crm.clientes'])))
);

-- negocio(deal_id) = existe o negócio AND tem_tela(crm.pipelines): a tela vira
-- InitPlan e só a existência do negócio continua por linha.
CREATE FUNCTION plugga_security.negocio_existe(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = alvo) $fn$;
REVOKE ALL ON FUNCTION plugga_security.negocio_existe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.negocio_existe(uuid) TO plugga_runtime;
ALTER POLICY rls_inserir ON public.deal_history WITH CHECK (
  (SELECT plugga_security.tem_tela(ARRAY['crm.pipelines'])) AND plugga_security.negocio_existe(deal_id)
);

-- Identidade da sessão/agente não varia entre linhas do mesmo comando.
ALTER POLICY rls_evento_inserir ON public.event_log WITH CHECK (
  actor_id = ((SELECT plugga_security.usuario_id()))::text
  AND ((actor_type = 'user'::actor_type AND (SELECT plugga_security.agente_id()) IS NULL)
    OR (actor_type = 'agent'::actor_type AND (SELECT plugga_security.agente_id()) IS NOT NULL))
);

-- Mesmas exceções e mensagens; a consulta de acesso a Clientes só roda quando
-- cliente/contato realmente mudam (antes rodava em toda linha atualizada).
CREATE OR REPLACE FUNCTION plugga_security.validar_escrita_crm()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE tela text; mudanca_de_dono boolean; muda_cliente boolean; muda_contato boolean;
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
  IF TG_TABLE_NAME IN ('deals', 'opportunities') THEN
    muda_cliente := (TG_OP = 'INSERT' AND NEW.client_id IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id);
    muda_contato := false;
    -- Só deals tem contact_id; o IF aninhado evita ler a coluna em opportunities.
    IF TG_TABLE_NAME = 'deals' THEN
      muda_contato := (TG_OP = 'INSERT' AND NEW.contact_id IS NOT NULL)
        OR (TG_OP = 'UPDATE' AND NEW.contact_id IS DISTINCT FROM OLD.contact_id);
    END IF;
    IF (muda_cliente OR muda_contato) AND NOT plugga_security.tem_tela(ARRAY['crm.clientes']) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'VINCULO_REQUER_CLIENTES';
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
$function$;

COMMIT;
