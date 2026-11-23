-- A data da movimentação de estoque passa a ter fuso (PLU-332): todo instante do
-- banco é timestamptz (test/bases-preservadas.spec.ts). O dia da movimentação é
-- gravado como o início do dia em Manaus, como o prazo de entrega do pedido de
-- compra, e lido de volta como dia de Manaus.

BEGIN;

ALTER TABLE public.movimentacoes_de_estoque
  ALTER COLUMN data TYPE timestamptz(6) USING (data::timestamp AT TIME ZONE 'America/Manaus');

COMMIT;
