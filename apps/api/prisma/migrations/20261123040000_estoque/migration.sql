-- Estoque de Suprimentos (PLU-332), aprovado no protótipo em 23/11/2026.
--
-- Um cadastro global: o item tem a empresa como campo obrigatório. O saldo sai
-- das movimentações, que são só de inserção (corrige-se com ajuste). As colunas
-- em_estoque e reservado do item são o saldo acumulado, gravado na mesma
-- transação de cada movimentação com o item travado, e os CHECK garantem que
-- nunca fica negativo nem abaixo do reservado.
--
-- A reserva nasce do pedido de compra atendido pelo estoque e termina baixada
-- (vira saída no recebimento) ou liberada (cancelamento).

BEGIN;

CREATE TYPE public.estoque_categoria AS ENUM ('kit_solar', 'material_eletrico', 'material_de_obra', 'ferramenta', 'escritorio', 'outros');
CREATE TYPE public.estoque_movimentacao_tipo AS ENUM ('entrada', 'saida', 'ajuste', 'reserva', 'liberacao');
CREATE TYPE public.estoque_origem_entrada AS ENUM ('compra', 'devolucao', 'saldo_inicial', 'outra');
CREATE TYPE public.estoque_destino_saida AS ENUM ('obra', 'cliente', 'interno');
CREATE TYPE public.estoque_reserva_estado AS ENUM ('ativa', 'baixada', 'liberada');

CREATE TABLE public.itens_de_estoque (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  categoria public.estoque_categoria NOT NULL,
  unidade text NOT NULL,
  estoque_minimo numeric(14,3) NOT NULL DEFAULT 0,
  em_estoque numeric(14,3) NOT NULL DEFAULT 0,
  reservado numeric(14,3) NOT NULL DEFAULT 0,
  custo_medio numeric(14,4),
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  ultima_movimentacao_em timestamptz(6),
  criado_por_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT itens_de_estoque_pkey PRIMARY KEY (id),
  CONSTRAINT itens_de_estoque_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT itens_de_estoque_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT itens_de_estoque_codigo_formato CHECK (codigo ~ '^[A-Z0-9./-]{1,40}$'),
  CONSTRAINT itens_de_estoque_saldo_coerente CHECK (estoque_minimo >= 0 AND reservado >= 0 AND em_estoque >= reservado),
  CONSTRAINT itens_de_estoque_custo_positivo CHECK (custo_medio IS NULL OR custo_medio > 0)
);
CREATE UNIQUE INDEX itens_de_estoque_company_id_codigo_key ON public.itens_de_estoque (company_id, codigo);
CREATE INDEX itens_de_estoque_ativo_nome_idx ON public.itens_de_estoque (ativo, nome);

CREATE TABLE public.reservas_de_estoque (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  item_do_pedido_id uuid NOT NULL,
  quantidade numeric(14,3) NOT NULL,
  estado public.estoque_reserva_estado NOT NULL DEFAULT 'ativa',
  reservada_em timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reservada_por_id uuid,
  encerrada_em timestamptz(6),
  encerrada_por_id uuid,
  CONSTRAINT reservas_de_estoque_pkey PRIMARY KEY (id),
  CONSTRAINT reservas_de_estoque_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.itens_de_estoque(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT reservas_de_estoque_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_de_compra(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT reservas_de_estoque_item_do_pedido_id_fkey FOREIGN KEY (item_do_pedido_id) REFERENCES public.itens_de_pedido(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT reservas_de_estoque_reservada_por_id_fkey FOREIGN KEY (reservada_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT reservas_de_estoque_encerrada_por_id_fkey FOREIGN KEY (encerrada_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT reservas_de_estoque_quantidade_positiva CHECK (quantidade > 0),
  CONSTRAINT reservas_de_estoque_encerramento_coerente CHECK ((estado = 'ativa') = (encerrada_em IS NULL))
);
CREATE INDEX reservas_de_estoque_item_id_estado_idx ON public.reservas_de_estoque (item_id, estado);
CREATE INDEX reservas_de_estoque_pedido_id_idx ON public.reservas_de_estoque (pedido_id);
-- Um item do pedido tem no máximo uma reserva ativa.
CREATE UNIQUE INDEX reservas_de_estoque_uma_ativa_por_item_do_pedido ON public.reservas_de_estoque (item_do_pedido_id) WHERE estado = 'ativa';

CREATE TABLE public.movimentacoes_de_estoque (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  tipo public.estoque_movimentacao_tipo NOT NULL,
  data date NOT NULL,
  quantidade numeric(14,3) NOT NULL,
  custo_unitario numeric(14,4),
  custo_medio_no_momento numeric(14,4),
  origem public.estoque_origem_entrada,
  destino public.estoque_destino_saida,
  obra_id uuid,
  client_id uuid,
  area text,
  pedido_id uuid,
  reserva_id uuid,
  observacao text,
  saldo_depois numeric(14,3) NOT NULL,
  registrada_por_id uuid,
  registrada_em timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT movimentacoes_de_estoque_pkey PRIMARY KEY (id),
  CONSTRAINT movimentacoes_de_estoque_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.itens_de_estoque(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentacoes_de_estoque_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentacoes_de_estoque_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentacoes_de_estoque_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_de_compra(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentacoes_de_estoque_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas_de_estoque(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentacoes_de_estoque_registrada_por_id_fkey FOREIGN KEY (registrada_por_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentacoes_de_estoque_quantidade_coerente CHECK ((tipo = 'ajuste' AND quantidade <> 0) OR (tipo <> 'ajuste' AND quantidade > 0)),
  CONSTRAINT movimentacoes_de_estoque_entrada_coerente CHECK ((tipo = 'entrada') = (origem IS NOT NULL) AND (tipo <> 'entrada' OR custo_unitario > 0)),
  CONSTRAINT movimentacoes_de_estoque_saldo_depois_nao_negativo CHECK (saldo_depois >= 0)
);
CREATE INDEX movimentacoes_de_estoque_item_id_registrada_em_idx ON public.movimentacoes_de_estoque (item_id, registrada_em);
CREATE INDEX movimentacoes_de_estoque_data_idx ON public.movimentacoes_de_estoque (data);
CREATE INDEX movimentacoes_de_estoque_pedido_id_idx ON public.movimentacoes_de_estoque (pedido_id);

-- Movimentação não se edita nem se apaga: a mesma guarda do event_log.
CREATE TRIGGER movimentacoes_de_estoque_append_only
  BEFORE UPDATE OR DELETE ON public.movimentacoes_de_estoque
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- O item do pedido de compra pode apontar para o item de estoque da mesma empresa.
ALTER TABLE public.itens_de_pedido
  ADD COLUMN item_de_estoque_id uuid,
  ADD CONSTRAINT itens_de_pedido_item_de_estoque_id_fkey FOREIGN KEY (item_de_estoque_id) REFERENCES public.itens_de_estoque(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX itens_de_pedido_item_de_estoque_id_idx ON public.itens_de_pedido (item_de_estoque_id);

-- RLS: mesmo regime das demais tabelas. Lê quem tem Estoque, Compras ou Financeiro
-- (Compras analisa e reserva; o Financeiro cancela e isso libera reserva). O
-- cadastro do item é de Estoque; o saldo, as reservas e as movimentações também
-- são gravados pelas ações do pedido (Compras e Financeiro). Nada se apaga.
DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['itens_de_estoque', 'reservas_de_estoque', 'movimentacoes_de_estoque'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.tem_tela(%L::text[]))', tabela,
      ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']);
  END LOOP;
END $tabelas$;
GRANT SELECT, INSERT, UPDATE ON public.itens_de_estoque, public.reservas_de_estoque TO plugga_runtime;
GRANT SELECT, INSERT ON public.movimentacoes_de_estoque TO plugga_runtime;
CREATE POLICY rls_inserir ON public.itens_de_estoque FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.estoque']));
CREATE POLICY rls_atualizar ON public.itens_de_estoque FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])) WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_inserir ON public.movimentacoes_de_estoque FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_inserir ON public.reservas_de_estoque FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_atualizar ON public.reservas_de_estoque FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])) WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));

-- Quem tem Estoque lê as obras ativas para o destino da saída.
ALTER POLICY rls_ler ON public.obras USING (plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal', 'engenharia-obras.obras']));

-- Clientes do destino: a definição de 20261123010000_compras_pedido_de_compra,
-- mais a tela de Estoque e os clientes que uma movimentação referencia.
CREATE OR REPLACE FUNCTION plugga_security.clientes_para_compras(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND (
        EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE p.client_id = c.id)
        OR EXISTS (SELECT 1 FROM public.obras o WHERE o.client_id = c.id)
        OR EXISTS (SELECT 1 FROM public.movimentacoes_de_estoque m WHERE m.client_id = c.id)))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;

-- Diretório: a definição de 20261123010000_compras_pedido_de_compra, mais quem
-- registrou movimentação, reservou ou cadastrou item, para quem tem Estoque.
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
    OR (plugga_security.tem_tela(ARRAY['suprimentos.estoque']) AND (
      EXISTS (SELECT 1 FROM public.movimentacoes_de_estoque m WHERE m.registrada_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.reservas_de_estoque r WHERE r.reservada_por_id = $1 OR r.encerrada_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.itens_de_estoque i WHERE i.criado_por_id = $1)
    ))
$fn$;

COMMIT;
