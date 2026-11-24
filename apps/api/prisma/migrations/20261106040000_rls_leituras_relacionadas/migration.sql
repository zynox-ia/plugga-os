BEGIN;

-- Contratos têm cliente obrigatório. Autorizar o contrato inclui esse vínculo,
-- sem conceder a tela de Clientes ou escrita no cadastro ao Financeiro.
CREATE FUNCTION plugga_security.cliente_para_contrato(alvo uuid, escrita boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = $1
    AND plugga_security.registro(c.owner_id, CASE WHEN $2 THEN ARRAY['crm.contratos'] ELSE
      ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'] END))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.cliente_para_contrato(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.cliente_para_contrato(uuid, boolean) TO plugga_runtime;

CREATE POLICY rls_cliente_contrato ON public.clients FOR SELECT TO plugga_runtime USING (
  plugga_security.registro(owner_id, ARRAY['crm.contratos'])
  OR (plugga_security.registro(owner_id, ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
    AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.client_id = clients.id))
);
DROP POLICY rls_ler ON public.contracts;
CREATE POLICY rls_ler ON public.contracts FOR SELECT TO plugga_runtime USING (
  plugga_security.registro(owner_id, ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
  AND plugga_security.cliente_para_contrato(client_id)
);
DROP POLICY rls_insert ON public.contracts;
CREATE POLICY rls_insert ON public.contracts FOR INSERT TO plugga_runtime WITH CHECK (
  plugga_security.registro(owner_id, ARRAY['crm.contratos']) AND plugga_security.cliente_para_contrato(client_id, true)
);
DROP POLICY rls_update ON public.contracts;
CREATE POLICY rls_update ON public.contracts FOR UPDATE TO plugga_runtime USING (
  plugga_security.registro(owner_id, ARRAY['crm.contratos']) AND plugga_security.cliente_para_contrato(client_id, true)
) WITH CHECK (
  plugga_security.registro(owner_id, ARRAY['crm.contratos']) AND plugga_security.cliente_para_contrato(client_id, true)
);
DROP POLICY rls_delete ON public.contracts;
CREATE POLICY rls_delete ON public.contracts FOR DELETE TO plugga_runtime USING (
  plugga_security.registro(owner_id, ARRAY['crm.contratos']) AND plugga_security.cliente_para_contrato(client_id, true)
);

CREATE OR REPLACE FUNCTION plugga_security.diretorio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $1 = plugga_security.usuario_id() OR plugga_security.plataforma()
    OR (plugga_security.tem_tela(ARRAY['crm.clientes', 'crm.pipelines', 'crm.contratos'], true)
      AND EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = $1))
    -- Revogar o acesso do responsável não apaga seu nome dos registros históricos.
    OR (plugga_security.tem_tela(ARRAY['crm.pipelines'], true) AND (
      EXISTS (SELECT 1 FROM public.deals d WHERE d.owner_id = $1)
      OR EXISTS (SELECT 1 FROM public.pipeline_members m WHERE m.user_id = $1)
      OR EXISTS (SELECT 1 FROM public.deal_history h WHERE h.actor_id = $1)
    ))
    OR (plugga_security.tem_tela(ARRAY['crm.clientes', 'energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda'], true)
      AND EXISTS (SELECT 1 FROM public.clients c WHERE c.owner_id = $1))
    OR (plugga_security.tem_tela(ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)
      AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.owner_id = $1))
    OR (plugga_security.tem_tela(ARRAY['crm.pipelines', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)
      AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.owner_id = $1))
    OR EXISTS (
      SELECT 1 FROM public.user_departamentos gestor
      JOIN public.user_departamentos equipe ON equipe.departamento = gestor.departamento
      WHERE gestor.user_id = plugga_security.usuario_id() AND equipe.user_id = $1
        AND gestor.nivel = 'gerente'
        AND EXISTS (SELECT 1 FROM unnest(gestor.telas) t(tela) WHERE split_part(t.tela, '.', 1) = gestor.departamento)
    )
$fn$;

COMMIT;
