-- Aperta a leitura de pedidos para quem tem só a tela Fornecedores (PLU-334,
-- decisão do coordenador em 23/11/2026): em vez da tabela inteira, só os pedidos
-- que têm cotação, que é o que o desempenho e o histórico do fornecedor mostram.
-- Estoque, Compras e Financeiro continuam lendo todos os pedidos.

BEGIN;

ALTER POLICY rls_ler ON public.pedidos_de_compra USING (
  plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
  OR (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores'])
    AND EXISTS (SELECT 1 FROM public.cotacoes_de_compra c WHERE c.pedido_id = pedidos_de_compra.id))
);

COMMIT;
