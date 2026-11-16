BEGIN;

-- A autorização para bloquear/atualizar também independe do responsável.
-- Somente USING passa a InitPlan; WITH CHECK e os vínculos permanecem intactos.
ALTER POLICY rls_update ON public.deals
  USING ((SELECT plugga_security.tem_tela(ARRAY['crm.pipelines'])));

COMMIT;
