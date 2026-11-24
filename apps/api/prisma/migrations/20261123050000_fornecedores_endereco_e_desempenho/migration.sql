-- Ficha rica do fornecedor (PLU-334): endereço completo, e leitura das cotações e
-- dos pedidos para quem tem a tela Fornecedores, que mostra o desempenho e o
-- histórico de cotações. Só leitura: cotar e mover pedido continua com Compras e
-- Financeiro.

BEGIN;

ALTER TABLE public.fornecedores
  ADD COLUMN cep text,
  ADD COLUMN logradouro text,
  ADD COLUMN numero text,
  ADD COLUMN complemento text,
  ADD COLUMN bairro text,
  ADD CONSTRAINT fornecedores_cep_formato CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');

ALTER POLICY rls_ler ON public.cotacoes_de_compra USING (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
ALTER POLICY rls_ler ON public.pedidos_de_compra USING (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores', 'suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));

COMMIT;
