BEGIN;

-- FK prova existência; WITH CHECK também precisa provar escopo e coerência.
CREATE FUNCTION plugga_security.oportunidade_para_contrato(alvo uuid, cliente uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = $1
    AND plugga_security.registro(o.owner_id, ARRAY['crm.pipelines'])
    AND (o.client_id IS NULL OR o.client_id = $2))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.oportunidade_para_contrato(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.oportunidade_para_contrato(uuid, uuid) TO plugga_runtime;

ALTER POLICY rls_insert ON public.opportunities WITH CHECK (
  plugga_security.registro(owner_id, ARRAY['crm.pipelines'])
  AND (client_id IS NULL OR plugga_security.cliente_do_pipeline(client_id))
);
ALTER POLICY rls_update ON public.opportunities WITH CHECK (
  plugga_security.registro(owner_id, ARRAY['crm.pipelines'])
  AND (client_id IS NULL OR plugga_security.cliente_do_pipeline(client_id))
);
ALTER POLICY rls_insert ON public.contracts WITH CHECK (
  plugga_security.registro(owner_id, ARRAY['crm.contratos'])
  AND plugga_security.cliente_para_contrato(client_id, true)
  AND (opportunity_id IS NULL OR plugga_security.oportunidade_para_contrato(opportunity_id, client_id))
);
ALTER POLICY rls_update ON public.contracts WITH CHECK (
  plugga_security.registro(owner_id, ARRAY['crm.contratos'])
  AND plugga_security.cliente_para_contrato(client_id, true)
  AND (opportunity_id IS NULL OR plugga_security.oportunidade_para_contrato(opportunity_id, client_id))
);

-- Nenhuma linha histórica é apagada ou remapeada.
COMMIT;
