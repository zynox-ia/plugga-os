-- Defesa em profundidade no "Pedir material" (PLU-345, revisão de 23/11/2026):
-- o pedido que a Engenharia cria nasce em `pedido_gerado`, sem nenhum marco de
-- Compras ou do Financeiro, e itens e passagens só entram enquanto ele está nessa
-- etapa. Assim, um erro da aplicação não grava um pedido já aprovado ou pago, nem
-- acrescenta item a um pedido que Compras já está tocando.
--
-- As UCs da O.S. passam a sair só de clientes ativos ou que alguma O.S. referencia,
-- como os nomes de `clientes_para_engenharia`.

BEGIN;

DROP POLICY rls_inserir_da_engenharia ON public.pedidos_de_compra;
CREATE POLICY rls_inserir_da_engenharia ON public.pedidos_de_compra FOR INSERT TO plugga_runtime
  WITH CHECK (ordem_de_servico_id IS NOT NULL
    AND solicitante_id = plugga_security.usuario_id() AND criado_por_id = plugga_security.usuario_id()
    AND etapa = 'pedido_gerado' AND origem_atendimento IS NULL AND cotacao_selecionada_id IS NULL
    AND necessidade_validada_em IS NULL AND estoque_decidido_em IS NULL AND cotacao_selecionada_em IS NULL
    AND aprovado_em IS NULL AND pagamento_registrado_em IS NULL AND recebido_em IS NULL
    AND concluido_em IS NULL AND cancelado_em IS NULL
    AND valor_cotado IS NULL AND valor_faturado IS NULL
    AND plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.id = ordem_de_servico_id AND o.situacao NOT IN ('concluida', 'cancelada')));

DO $filhos$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['itens_de_pedido', 'pedidos_de_compra_etapas'] LOOP
    EXECUTE format('DROP POLICY rls_inserir_da_engenharia ON public.%I', tabela);
    EXECUTE format($p$CREATE POLICY rls_inserir_da_engenharia ON public.%I FOR INSERT TO plugga_runtime
      WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
        AND EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE p.id = pedido_id AND p.ordem_de_servico_id IS NOT NULL
          AND p.criado_por_id = plugga_security.usuario_id() AND p.etapa = 'pedido_gerado' AND p.cancelado_em IS NULL))$p$, tabela);
  END LOOP;
END $filhos$;
-- A passagem que a Engenharia abre é só a primeira, de pedido gerado.
DROP POLICY rls_inserir_da_engenharia ON public.pedidos_de_compra_etapas;
CREATE POLICY rls_inserir_da_engenharia ON public.pedidos_de_compra_etapas FOR INSERT TO plugga_runtime
  WITH CHECK (etapa = 'pedido_gerado' AND saiu_em IS NULL
    AND plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE p.id = pedido_id AND p.ordem_de_servico_id IS NOT NULL
      AND p.criado_por_id = plugga_security.usuario_id() AND p.etapa = 'pedido_gerado' AND p.cancelado_em IS NULL));

CREATE OR REPLACE FUNCTION plugga_security.ucs_para_engenharia(clientes uuid[])
RETURNS TABLE(id uuid, client_id uuid, code text, distributor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.client_id, u.code, u.distributor FROM public.consumer_units u
  JOIN public.clients c ON c.id = u.client_id
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND u.client_id = ANY($1)
    AND (c.active OR EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.client_id = c.id))
  ORDER BY u.code
  LIMIT 500
$fn$;

COMMIT;
