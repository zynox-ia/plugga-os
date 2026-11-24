-- S4 da separação (PLU-342): "Importar do OMIE", ação explícita da gerência do Financeiro,
-- cria no Plugga OS o que falta e grava o vínculo com o OMIE. Nunca sobrescreve: o vínculo
-- só se insere (sem UPDATE nem DELETE), e o cadastro do Plugga OS segue com as políticas da
-- gerência que já existem (20261124500600).
--
-- A importação roda pelo pool da aplicação, com a sessão de quem pediu: a política exige a
-- gerência (ou a plataforma), em InitPlan.
BEGIN;

GRANT INSERT (categoria_id, company_id, omie_codigo, lida_em, updated_at) ON public.omie_categorias TO plugga_runtime;
GRANT INSERT (conta_corrente_id, company_id, omie_codigo, lida_em, updated_at) ON public.omie_contas_correntes TO plugga_runtime;

DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['omie_categorias', 'omie_contas_correntes'] LOOP
    EXECUTE format($p$CREATE POLICY rls_gerencia_inserir ON public.%I FOR INSERT TO plugga_runtime
      WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)))$p$, tabela);
  END LOOP;
END $tabelas$;

COMMIT;
