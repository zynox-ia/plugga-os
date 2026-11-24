-- Conciliação (PLU-339), fatia C5: o lançamento que nasce pago (ou recebido) na Conciliação,
-- já conciliado com a linha do extrato, ou só pago quando o valor difere ("Criar sem conciliar").
--
-- - A saída de origem `tarifa_bancaria` ou `conciliacao` fica pronta sem a aprovação F2: a
--   CHECK da aprovação abre só para essas duas origens, e só para o que já nasce liquidado.
-- - A tarifa é sempre saída.
-- - Quem cria pelo pool da aplicação (RLS de INSERT):
--   - a tarifa: quem tem a tela Conciliação;
--   - a despesa guiada: a gerência, com a tela Conciliação;
--   - a receita guiada: quem tem a tela Conciliação.
--   A política RESTRITIVA vale contra todas as permissivas: quem só tem Contas a pagar não
--   cria, pela própria política dele, uma saída paga sem aprovação.
BEGIN;

ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_aprovacao_coerente;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_aprovacao_coerente CHECK (tipo <> 'saida' OR etapa = 'aberta' OR aprovado_em IS NOT NULL OR cancelado_em IS NOT NULL
    OR origem IN ('tarifa_bancaria', 'conciliacao')) NOT VALID,
  ADD CONSTRAINT lancamentos_nasce_liquidado CHECK (origem NOT IN ('tarifa_bancaria', 'conciliacao') OR pago_em IS NOT NULL OR recebido_em IS NOT NULL) NOT VALID,
  ADD CONSTRAINT lancamentos_tarifa_e_saida CHECK (origem <> 'tarifa_bancaria' OR tipo = 'saida') NOT VALID;
-- A primeira só afrouxa a anterior, e as outras duas tratam de origens que ainda não existem
-- em linha nenhuma: a validação passa, sem trava que pare as gravações.
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_aprovacao_coerente;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_nasce_liquidado;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_tarifa_e_saida;

CREATE POLICY rls_conciliacao_inserir ON public.lancamentos FOR INSERT TO plugga_runtime WITH CHECK (
  (origem = 'tarifa_bancaria' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'])))
  OR (origem = 'conciliacao' AND tipo = 'saida' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'], true)))
  OR (origem = 'conciliacao' AND tipo = 'entrada' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao']))));
CREATE POLICY rls_conciliacao_restrita ON public.lancamentos AS RESTRICTIVE FOR INSERT TO plugga_runtime WITH CHECK (
  origem NOT IN ('tarifa_bancaria', 'conciliacao')
  OR (origem = 'tarifa_bancaria' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'])))
  OR (origem = 'conciliacao' AND tipo = 'saida' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'], true)))
  OR (origem = 'conciliacao' AND tipo = 'entrada' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao']))));

-- O fornecedor sugerido no "Criar tarifa": o da última tarifa da conta.
CREATE INDEX lancamentos_tarifa_da_conta_idx ON public.lancamentos (conta_corrente_id, created_at DESC) WHERE origem = 'tarifa_bancaria';

-- O tipo do movimento no OFX (TRNTYPE: FEE, SRVCHG, DEBIT...), para a tela saber que a linha
-- parece tarifa. Nulo nos movimentos que entraram antes. É um código do padrão, não texto do banco.
ALTER TABLE public.movimentos_do_extrato
  ADD COLUMN tipo_no_banco text,
  ADD CONSTRAINT movimentos_do_extrato_tipo_no_banco_codigo CHECK (tipo_no_banco ~ '^[A-Z]{2,12}$');
GRANT INSERT (tipo_no_banco) ON public.movimentos_do_extrato TO plugga_runtime;

COMMIT;
