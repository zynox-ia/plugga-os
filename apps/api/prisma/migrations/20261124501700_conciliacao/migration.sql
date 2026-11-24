-- Conciliação (PLU-339), fatia C3: a linha do extrato bancário e o lançamento do Plugga OS
-- viram um par, sempre com o mesmo valor (a regra fica na aplicação; aqui, a coerência).
--
-- - O movimento conciliado aponta para um lançamento (um para um) da MESMA conta: a chave
--   composta (lancamento_id, conta_corrente_id) garante, e a conta amarra a empresa.
-- - `lancamentos.conciliacao_marcada`: o "Marcar pendente" do lado do lançamento (o pago que
--   ainda não apareceu no extrato).
-- - A etapa conciliada e as colunas de conciliação do lançamento andam juntas (CHECK).
-- Quem tem a tela Conciliação concilia, marca e desfaz pelo pool da aplicação (desfazer é
-- da gerência, na aplicação). Nada se apaga.
BEGIN;

CREATE UNIQUE INDEX lancamentos_id_conta_corrente_id_key ON public.lancamentos (id, conta_corrente_id);
ALTER TABLE public.lancamentos
  ADD COLUMN conciliacao_marcada boolean NOT NULL DEFAULT false,
  -- NOT VALID: vale para tudo o que se gravar daqui em diante, sem que o deploy dependa dos
  -- lançamentos que já existem (a validação deles fica para uma migration própria).
  ADD CONSTRAINT lancamentos_conciliacao_coerente CHECK ((etapa = 'conciliada') = (conciliado_em IS NOT NULL)) NOT VALID;

ALTER TABLE public.movimentos_do_extrato
  ADD COLUMN lancamento_id uuid,
  ADD COLUMN conciliado_em timestamptz(6),
  ADD COLUMN conciliado_por_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT movimentos_do_extrato_lancamento_da_conta_fkey FOREIGN KEY (lancamento_id, conta_corrente_id)
    REFERENCES public.lancamentos(id, conta_corrente_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT movimentos_do_extrato_conciliado_coerente CHECK (
    (estado = 'conciliado') = (lancamento_id IS NOT NULL) AND (lancamento_id IS NULL) = (conciliado_em IS NULL));
CREATE UNIQUE INDEX movimentos_do_extrato_lancamento_id_key ON public.movimentos_do_extrato (lancamento_id);
CREATE INDEX movimentos_do_extrato_conciliado_por_id_idx ON public.movimentos_do_extrato (conciliado_por_id);

GRANT UPDATE (estado, lancamento_id, conciliado_em, conciliado_por_id) ON public.movimentos_do_extrato TO plugga_runtime;
CREATE POLICY rls_conciliar ON public.movimentos_do_extrato FOR UPDATE TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'])))
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'])));

COMMIT;
