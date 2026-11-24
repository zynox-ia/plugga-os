-- Compras de Suprimentos (PLU-327): o pedido de compra e as sete etapas.
--
-- Decisões do André em 23/11/2026 (protótipo aprovado):
--   * a numeração do pedido é única e global (PC-0001…), não por empresa;
--     a empresa é campo obrigatório e filtro, sem separação de acesso;
--   * sem segregação de função, mas toda ação grava quem fez e quando;
--   * cancelar guarda a etapa em que o pedido parou e o motivo.
--
-- Esta migração:
--   1. troca a numeração por empresa por uma sequência global;
--   2. acrescenta descrição, autoria de cada marco, cancelamento, pagamento,
--      comprovante, quem fechou cada passagem e os metadados do anexo;
--   3. troca a política "só plataforma" das tabelas de Compras e de obras por
--      leitura de Compras e Financeiro, escrita conforme quem opera cada parte,
--      e nenhuma política de DELETE (exceto itens, trocados na edição);
--   4. estende o diretório de pessoas a quem lê Compras e Fornecedores, e cria
--      a função que entrega só id e nome de clientes para o destino do pedido.

BEGIN;

-- 1. Numeração global. Começa depois do maior número já gravado.
DROP INDEX public.pedidos_de_compra_company_id_numero_key;
CREATE SEQUENCE public.pedidos_de_compra_numero_seq AS integer OWNED BY public.pedidos_de_compra.numero;
SELECT setval('public.pedidos_de_compra_numero_seq', coalesce((SELECT max(numero) FROM public.pedidos_de_compra), 0) + 1, false);
ALTER TABLE public.pedidos_de_compra ALTER COLUMN numero SET DEFAULT nextval('public.pedidos_de_compra_numero_seq');
CREATE UNIQUE INDEX pedidos_de_compra_numero_key ON public.pedidos_de_compra (numero);
GRANT USAGE, SELECT ON SEQUENCE public.pedidos_de_compra_numero_seq TO plugga_runtime;

-- O quadro é global: os índices por empresa viram índices por etapa e data.
DROP INDEX public.pedidos_de_compra_company_id_etapa_idx;
DROP INDEX public.pedidos_de_compra_company_id_responsavel_id_etapa_idx;
DROP INDEX public.pedidos_de_compra_company_id_concluido_em_idx;

-- 2. Campos do pedido.
ALTER TABLE public.pedidos_de_compra
  ALTER COLUMN valor_orcado DROP NOT NULL,
  ADD COLUMN descricao text,
  ADD COLUMN criado_por_id uuid,
  ADD COLUMN estoque_decidido_em timestamptz(6),
  ADD COLUMN estoque_decidido_por_id uuid,
  ADD COLUMN cotacao_selecionada_em timestamptz(6),
  ADD COLUMN aprovado_em timestamptz(6),
  ADD COLUMN forma_pagamento public.forma_de_pagamento,
  ADD COLUMN pagamento_observacao text,
  ADD COLUMN pagamento_registrado_em timestamptz(6),
  ADD COLUMN pagamento_registrado_por_id uuid,
  ADD COLUMN comprovante_chave text,
  ADD COLUMN comprovante_nome text,
  ADD COLUMN comprovante_tamanho integer,
  ADD COLUMN comprovante_tipo text,
  ADD COLUMN recebimento_confirmado_por_id uuid,
  ADD COLUMN cancelado_em timestamptz(6),
  ADD COLUMN cancelado_por_id uuid,
  ADD COLUMN motivo_cancelamento text;

CREATE INDEX pedidos_de_compra_etapa_idx ON public.pedidos_de_compra (etapa);
CREATE INDEX pedidos_de_compra_responsavel_id_idx ON public.pedidos_de_compra (responsavel_id);
CREATE INDEX pedidos_de_compra_concluido_em_idx ON public.pedidos_de_compra (concluido_em);
CREATE INDEX pedidos_de_compra_created_at_idx ON public.pedidos_de_compra (created_at);

ALTER TABLE public.pedidos_de_compra
  ADD CONSTRAINT pedidos_de_compra_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT pedidos_de_compra_estoque_decidido_por_id_fkey FOREIGN KEY (estoque_decidido_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT pedidos_de_compra_selecionou_cotacao_id_fkey FOREIGN KEY (selecionou_cotacao_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT pedidos_de_compra_aprovou_id_fkey FOREIGN KEY (aprovou_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT pedidos_de_compra_pagamento_registrado_por_id_fkey FOREIGN KEY (pagamento_registrado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT pedidos_de_compra_recebimento_confirmado_por_id_fkey FOREIGN KEY (recebimento_confirmado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT pedidos_de_compra_cancelado_por_id_fkey FOREIGN KEY (cancelado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  -- Cancelado e concluído são excludentes; cancelar exige motivo.
  ADD CONSTRAINT pedidos_de_compra_cancelamento_coerente CHECK (
    (cancelado_em IS NULL AND motivo_cancelamento IS NULL)
    OR (cancelado_em IS NOT NULL AND motivo_cancelamento IS NOT NULL AND etapa <> 'concluido')
  ),
  ADD CONSTRAINT pedidos_de_compra_faturado_positivo CHECK (valor_faturado IS NULL OR valor_faturado > 0);

-- Quem fechou cada passagem e a observação da ação (o motivo, na revisão).
ALTER TABLE public.pedidos_de_compra_etapas
  ADD COLUMN saiu_por_id uuid,
  ADD COLUMN observacao text,
  ADD CONSTRAINT pedidos_de_compra_etapas_saiu_por_id_fkey FOREIGN KEY (saiu_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Quem cotou e o que é o anexo.
ALTER TABLE public.cotacoes_de_compra
  ADD COLUMN criado_por_id uuid,
  ADD COLUMN arquivo_tamanho integer,
  ADD COLUMN arquivo_tipo text,
  ADD CONSTRAINT cotacoes_de_compra_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.obras
  ADD COLUMN criado_por_id uuid,
  ADD CONSTRAINT obras_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Acesso pelas telas, no lugar do "só plataforma".
DO $politicas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['pedidos_de_compra', 'itens_de_pedido', 'pedidos_de_compra_etapas', 'cotacoes_de_compra', 'obras'] LOOP
    EXECUTE format('DROP POLICY rls_plataforma ON public.%I', tabela);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.tem_tela(%L::text[]))', tabela,
      CASE WHEN tabela = 'obras'
        THEN ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal', 'engenharia-obras.obras']
        ELSE ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'] END);
  END LOOP;
END $politicas$;

-- Criar pedido, item, cotação e obra é de quem opera Compras.
CREATE POLICY rls_inserir ON public.pedidos_de_compra FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras']));
CREATE POLICY rls_inserir ON public.itens_de_pedido FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras']));
CREATE POLICY rls_apagar ON public.itens_de_pedido FOR DELETE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.compras']));
CREATE POLICY rls_inserir ON public.cotacoes_de_compra FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras']));
CREATE POLICY rls_inserir ON public.obras FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras']));

-- Mover o pedido é de Compras e do Financeiro (aprovar, revisar, pagar). Qual
-- ação cabe a quem é regra da aplicação; o banco garante o alcance da tela.
CREATE POLICY rls_atualizar ON public.pedidos_de_compra FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_inserir ON public.pedidos_de_compra_etapas FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_atualizar ON public.pedidos_de_compra_etapas FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));

-- 4a. Clientes do destino: só id e nome, para quem lê Compras. A busca entrega
-- clientes ativos; a leitura por id só os que algum pedido ou obra referencia.
CREATE FUNCTION plugga_security.clientes_para_compras(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND (
        EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE p.client_id = c.id)
        OR EXISTS (SELECT 1 FROM public.obras o WHERE o.client_id = c.id)))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;
REVOKE ALL ON FUNCTION plugga_security.clientes_para_compras(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.clientes_para_compras(text, uuid[]) TO plugga_runtime;

-- 4b. Diretório: a definição de 20261106060000_permissoes_por_tela, mais quem
-- aparece num pedido de compra ou pode ser responsável por um (para quem lê
-- Compras) e quem criou ou alterou um fornecedor (para quem tem Fornecedores).
CREATE OR REPLACE FUNCTION plugga_security.diretorio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $1 = plugga_security.usuario_id() OR plugga_security.plataforma()
    OR (plugga_security.tem_tela(ARRAY['crm.pipelines']) AND (
      EXISTS (SELECT 1 FROM public.deals d WHERE d.owner_id = $1 OR d.created_by_id = $1)
      OR EXISTS (SELECT 1 FROM public.deal_history h WHERE h.actor_id = $1)
      OR EXISTS (SELECT 1 FROM public.pipeline_members m WHERE m.user_id = $1)
      OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.owner_id = $1)
    ))
    OR (plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.owner_id = $1))
    OR (plugga_security.tem_tela(ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
      AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.owner_id = $1))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active') AND (
      (plugga_security.tem_tela(ARRAY['crm.clientes', 'crm.pipelines', 'crm.contratos'])
        AND EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = $1))
      OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = $1 AND d.departamento = 'crm'
        AND EXISTS (SELECT 1 FROM unnest(d.telas) t(tela)
          WHERE t.tela IN ('crm.clientes', 'crm.pipelines', 'crm.contratos') AND plugga_security.tem_tela(ARRAY[t.tela])))
    ))
    OR (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']) AND (
      EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE $1 IN (p.solicitante_id, p.responsavel_id, p.criado_por_id,
        p.estoque_decidido_por_id, p.selecionou_cotacao_id, p.aprovou_id, p.pagamento_registrado_por_id,
        p.recebimento_confirmado_por_id, p.cancelado_por_id))
      OR EXISTS (SELECT 1 FROM public.pedidos_de_compra_etapas e WHERE e.responsavel_id = $1 OR e.saiu_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.cotacoes_de_compra c WHERE c.criado_por_id = $1)
      -- Quem pode ser solicitante ou responsável: pessoa ativa com Compras.
      OR EXISTS (SELECT 1 FROM public.users u JOIN public.user_departamentos d ON d.user_id = u.id
        WHERE u.id = $1 AND u.status = 'active' AND d.departamento = 'suprimentos' AND 'suprimentos.compras' = ANY(d.telas))
    ))
    OR (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores'])
      AND EXISTS (SELECT 1 FROM public.fornecedores f WHERE f.criado_por_id = $1 OR f.atualizado_por_id = $1))
$fn$;

COMMIT;
