-- O plano de contas e as contas correntes passam a ser cadastrados no Plugga OS
-- (PLU-342, S3b: o Plugga OS é o dono do financeiro).
--
-- Só a gerência do Financeiro (e a plataforma) grava: políticas de INSERT e UPDATE com
-- `tem_tela(..., true)` dentro de (SELECT ...), que vira InitPlan. Quem lê continua
-- como antes.
--
-- O privilégio é por coluna. A aplicação não muda a empresa, nem o código e o tipo da
-- categoria (corrigir = desativar e criar outra), nem o saldo e os campos do conector.
-- Sem DELETE: desativar tira o cadastro dos menus.
BEGIN;

GRANT INSERT (company_id, codigo, nome, tipo, natureza, grupo_nome, ativa, created_at, updated_at)
  ON public.categorias_financeiras TO plugga_runtime;
GRANT UPDATE (nome, natureza, grupo_nome, ativa, updated_at)
  ON public.categorias_financeiras TO plugga_runtime;

GRANT INSERT (company_id, nome, banco, agencia, numero, ativa, created_at, updated_at)
  ON public.contas_correntes TO plugga_runtime;
GRANT UPDATE (nome, banco, agencia, numero, ativa, updated_at)
  ON public.contas_correntes TO plugga_runtime;

DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['categorias_financeiras', 'contas_correntes'] LOOP
    EXECUTE format($p$CREATE POLICY rls_gerencia_inserir ON public.%I FOR INSERT TO plugga_runtime
      WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)))$p$, tabela);
    EXECUTE format($p$CREATE POLICY rls_gerencia_atualizar ON public.%I FOR UPDATE TO plugga_runtime
      USING ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)))
      WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)))$p$, tabela);
  END LOOP;
END $tabelas$;

COMMIT;
