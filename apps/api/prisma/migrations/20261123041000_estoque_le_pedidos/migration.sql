-- Estoque lê os pedidos de compra (PLU-332): a ficha do item mostra o pedido que
-- reserva o material (número, título, etapa e destino), e a movimentação mostra
-- o pedido ligado. Só leitura: criar e mover pedido continua com Compras e Financeiro.

BEGIN;

ALTER POLICY rls_ler ON public.pedidos_de_compra USING (plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));

COMMIT;
