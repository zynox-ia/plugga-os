-- O saldo inicial da conta corrente (PLU-342): o saldo informado pela gerência do
-- Financeiro e o dia a que ele se refere. É o ponto de partida do saldo da conta no
-- Plugga OS; a conciliação pelo extrato calcula daí em diante. Nada vem do OMIE.
-- O dia é guardado como o início do dia de Manaus, como o vencimento do lançamento.
BEGIN;

ALTER TABLE public.contas_correntes
  ADD COLUMN saldo_inicial numeric(14, 2),
  ADD COLUMN saldo_inicial_em timestamptz(6),
  ADD CONSTRAINT contas_correntes_saldo_inicial_com_dia CHECK ((saldo_inicial IS NULL) = (saldo_inicial_em IS NULL));

-- A gerência grava pelas políticas que já existem (rls_gerencia_inserir/atualizar).
GRANT INSERT (saldo_inicial, saldo_inicial_em), UPDATE (saldo_inicial, saldo_inicial_em)
  ON public.contas_correntes TO plugga_runtime;

COMMIT;
