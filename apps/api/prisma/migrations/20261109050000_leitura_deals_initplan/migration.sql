BEGIN;

-- A permissão de leitura independe do responsável desde permissões_por_tela:
-- registro(dono, telas) retorna tem_tela(telas). O subselect mantém essa regra
-- e calcula a autorização estável uma vez por comando, em vez de por negócio.
ALTER POLICY rls_ler ON public.deals
  USING ((SELECT plugga_security.tem_tela(ARRAY['crm.pipelines'])));

COMMIT;
