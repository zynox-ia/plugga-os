-- Financeiro (PLU-336), aprovado no protótipo em 23/11/2026: os lançamentos da
-- Plugga e da Waze, saídas (contas a pagar) e entradas (cobranças), numa tabela
-- só, mais o espelho das categorias e das contas correntes do OMIE de cada
-- empresa.
--
-- Acesso pelas telas existentes (decisão do Coordenador em 23/11/2026): a saída
-- é de `financeiro.pagar`, a entrada de `financeiro.receber`; a Conciliação lê
-- as duas. Nada se apaga: cancelar é uma etapa com motivo.

BEGIN;

CREATE TYPE public.financeiro_tipo_lancamento AS ENUM ('saida', 'entrada');
CREATE TYPE public.financeiro_etapa AS ENUM ('aberta', 'aprovada', 'paga', 'gerada', 'nf_emitida', 'boleto_gerado', 'enviada', 'recebida', 'conciliada');
CREATE TYPE public.financeiro_forma AS ENUM ('pix', 'boleto', 'cartao_credito', 'transferencia', 'debito_automatico');
CREATE TYPE public.financeiro_origem AS ENUM ('avulsa', 'pedido_de_compra', 'agente', 'cobranca_manual');
CREATE TYPE public.financeiro_estado_omie AS ENUM ('nao_enviado', 'enviando', 'enviado', 'erro', 'baixado', 'divergente');
CREATE TYPE public.financeiro_tipo_categoria AS ENUM ('receita', 'despesa');
CREATE TYPE public.financeiro_natureza_categoria AS ENUM ('receita', 'material', 'servico', 'telecom', 'aluguel', 'locacao', 'imposto', 'pessoal', 'tarifa', 'outros');

-- Espelho do plano de contas do OMIE de cada empresa. `natureza` é do Plugga OS (o ícone).
CREATE TABLE public.categorias_financeiras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo public.financeiro_tipo_categoria NOT NULL,
  natureza public.financeiro_natureza_categoria NOT NULL,
  grupo_nome text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  lida_em timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT categorias_financeiras_pkey PRIMARY KEY (id),
  CONSTRAINT categorias_financeiras_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT categorias_financeiras_codigo_formato CHECK (codigo ~ '^[0-9]+(\.[0-9]+)+$')
);
CREATE UNIQUE INDEX categorias_financeiras_company_id_codigo_key ON public.categorias_financeiras (company_id, codigo);
-- Alvo da chave composta do lançamento: a categoria é da mesma empresa.
CREATE UNIQUE INDEX categorias_financeiras_id_company_id_key ON public.categorias_financeiras (id, company_id);

-- Espelho das contas correntes do OMIE de cada empresa. Somente leitura na tela.
CREATE TABLE public.contas_correntes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  omie_codigo text,
  nome text NOT NULL,
  banco text,
  agencia text,
  numero text,
  saldo numeric(14,2),
  saldo_lido_em timestamptz(6),
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT contas_correntes_pkey PRIMARY KEY (id),
  CONSTRAINT contas_correntes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contas_correntes_saldo_coerente CHECK ((saldo IS NULL) = (saldo_lido_em IS NULL))
);
CREATE UNIQUE INDEX contas_correntes_company_id_omie_codigo_key ON public.contas_correntes (company_id, omie_codigo);
CREATE UNIQUE INDEX contas_correntes_id_company_id_key ON public.contas_correntes (id, company_id);

-- Numeração global por tipo: CP-0001… e CR-0001…, não por empresa.
CREATE SEQUENCE public.lancamentos_saida_numero_seq;
CREATE SEQUENCE public.lancamentos_entrada_numero_seq;

CREATE TABLE public.lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo public.financeiro_tipo_lancamento NOT NULL,
  numero integer NOT NULL,
  company_id text NOT NULL,
  fornecedor_id uuid,
  client_id uuid,
  categoria_id uuid NOT NULL,
  conta_corrente_id uuid,
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL,
  -- Início do dia de Manaus (regra: DateTime só timestamptz).
  vencimento timestamptz(6) NOT NULL,
  competencia text,
  etapa public.financeiro_etapa NOT NULL,
  forma public.financeiro_forma,
  observacao text,
  origem public.financeiro_origem NOT NULL,
  pedido_de_compra_id uuid,
  omie_estado public.financeiro_estado_omie NOT NULL DEFAULT 'nao_enviado',
  omie_codigo text,
  omie_motivo text,
  criado_por_id uuid,
  aprovado_em timestamptz(6),
  aprovado_por_id uuid,
  pago_em timestamptz(6),
  pagamento_registrado_em timestamptz(6),
  pagamento_registrado_por_id uuid,
  recebido_em timestamptz(6),
  valor_recebido numeric(14,2),
  recebimento_registrado_em timestamptz(6),
  recebimento_registrado_por_id uuid,
  -- Dia do pagamento ou do recebimento, para a ordem da lista e do quadro.
  liquidado_em timestamptz(6) GENERATED ALWAYS AS (COALESCE(pago_em, recebido_em)) STORED,
  conciliado_em timestamptz(6),
  conciliado_por_id uuid,
  cancelado_em timestamptz(6),
  cancelado_por_id uuid,
  cancelamento_motivo text,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT lancamentos_pkey PRIMARY KEY (id),
  CONSTRAINT lancamentos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lancamentos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lancamentos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lancamentos_categoria_da_empresa_fkey FOREIGN KEY (categoria_id, company_id) REFERENCES public.categorias_financeiras(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lancamentos_conta_da_empresa_fkey FOREIGN KEY (conta_corrente_id, company_id) REFERENCES public.contas_correntes(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lancamentos_pedido_de_compra_id_fkey FOREIGN KEY (pedido_de_compra_id) REFERENCES public.pedidos_de_compra(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lancamentos_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT lancamentos_aprovado_por_id_fkey FOREIGN KEY (aprovado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT lancamentos_pagamento_registrado_por_id_fkey FOREIGN KEY (pagamento_registrado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT lancamentos_recebimento_registrado_por_id_fkey FOREIGN KEY (recebimento_registrado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT lancamentos_conciliado_por_id_fkey FOREIGN KEY (conciliado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT lancamentos_cancelado_por_id_fkey FOREIGN KEY (cancelado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT lancamentos_valor_positivo CHECK (valor > 0 AND (valor_recebido IS NULL OR valor_recebido > 0)),
  CONSTRAINT lancamentos_descricao_preenchida CHECK (length(btrim(descricao)) > 0),
  -- Saída paga a um fornecedor; entrada cobra um cliente numa competência.
  CONSTRAINT lancamentos_saida_coerente CHECK (tipo <> 'saida' OR (fornecedor_id IS NOT NULL AND client_id IS NULL AND competencia IS NULL
    AND etapa IN ('aberta', 'aprovada', 'paga', 'conciliada') AND recebido_em IS NULL AND valor_recebido IS NULL)),
  CONSTRAINT lancamentos_entrada_coerente CHECK (tipo <> 'entrada' OR (client_id IS NOT NULL AND fornecedor_id IS NULL AND competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'
    AND etapa IN ('gerada', 'nf_emitida', 'boleto_gerado', 'enviada', 'recebida', 'conciliada') AND pago_em IS NULL AND pedido_de_compra_id IS NULL)),
  CONSTRAINT lancamentos_pagamento_coerente CHECK ((pago_em IS NULL) = (pagamento_registrado_em IS NULL)),
  CONSTRAINT lancamentos_recebimento_coerente CHECK ((recebido_em IS NULL) = (recebimento_registrado_em IS NULL) AND (recebido_em IS NULL) = (valor_recebido IS NULL)),
  CONSTRAINT lancamentos_cancelamento_coerente CHECK ((cancelado_em IS NULL) = (cancelamento_motivo IS NULL)
    AND (cancelado_em IS NULL OR etapa NOT IN ('paga', 'recebida', 'conciliada'))),
  CONSTRAINT lancamentos_aprovacao_coerente CHECK (tipo <> 'saida' OR etapa = 'aberta' OR aprovado_em IS NOT NULL OR cancelado_em IS NOT NULL),
  CONSTRAINT lancamentos_origem_coerente CHECK ((origem = 'pedido_de_compra') = (pedido_de_compra_id IS NOT NULL))
);
CREATE UNIQUE INDEX lancamentos_tipo_numero_key ON public.lancamentos (tipo, numero);
-- O pedido de compra vira conta a pagar só uma vez (PLU-341).
CREATE UNIQUE INDEX lancamentos_pedido_de_compra_id_key ON public.lancamentos (pedido_de_compra_id);
-- Uma cobrança por cliente, empresa e competência (F3), fora as canceladas.
CREATE UNIQUE INDEX lancamentos_uma_cobranca_por_competencia ON public.lancamentos (company_id, client_id, competencia)
  WHERE tipo = 'entrada' AND cancelado_em IS NULL;
CREATE INDEX lancamentos_vencimento_idx ON public.lancamentos (vencimento);
CREATE INDEX lancamentos_tipo_etapa_idx ON public.lancamentos (tipo, etapa);
CREATE INDEX lancamentos_fornecedor_id_idx ON public.lancamentos (fornecedor_id);
CREATE INDEX lancamentos_client_id_idx ON public.lancamentos (client_id);

-- O número sai da sequência do tipo na inserção: a aplicação não escolhe.
CREATE FUNCTION public.lancamentos_numerar() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $fn$
BEGIN
  NEW.numero := CASE NEW.tipo WHEN 'saida' THEN nextval('public.lancamentos_saida_numero_seq') ELSE nextval('public.lancamentos_entrada_numero_seq') END;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER lancamentos_numerar BEFORE INSERT ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.lancamentos_numerar();

-- Tipo, número, empresa e origem não mudam depois de criados.
CREATE FUNCTION public.lancamentos_imutaveis() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.tipo <> OLD.tipo OR NEW.numero <> OLD.numero OR NEW.company_id <> OLD.company_id
    OR NEW.origem <> OLD.origem OR NEW.pedido_de_compra_id IS DISTINCT FROM OLD.pedido_de_compra_id THEN
    RAISE EXCEPTION 'tipo, número, empresa e origem do lançamento não mudam' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER lancamentos_imutaveis BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.lancamentos_imutaveis();

-- RLS: mesmo regime das demais tabelas; sem DELETE para ninguém.
DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['categorias_financeiras', 'contas_correntes', 'lancamentos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
  END LOOP;
END $tabelas$;

-- Cadastros: lê quem tem qualquer tela do Financeiro. A escrita vem da leitura do
-- OMIE (PLU-342) e das Configurações (PLU-340), com as próprias migrations.
GRANT SELECT ON public.categorias_financeiras, public.contas_correntes TO plugga_runtime;
CREATE POLICY rls_ler ON public.categorias_financeiras FOR SELECT TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_ler ON public.contas_correntes FOR SELECT TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));

-- Lançamento: a saída é de quem tem `pagar`, a entrada de quem tem `receber`; a
-- Conciliação lê os dois.
GRANT SELECT, INSERT, UPDATE ON public.lancamentos TO plugga_runtime;
GRANT USAGE ON SEQUENCE public.lancamentos_saida_numero_seq, public.lancamentos_entrada_numero_seq TO plugga_runtime;
CREATE POLICY rls_ler ON public.lancamentos FOR SELECT TO plugga_runtime USING (
  (tipo = 'saida' AND plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao']))
  OR (tipo = 'entrada' AND plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])));
CREATE POLICY rls_inserir ON public.lancamentos FOR INSERT TO plugga_runtime WITH CHECK (
  (tipo = 'saida' AND plugga_security.tem_tela(ARRAY['financeiro.pagar']))
  OR (tipo = 'entrada' AND plugga_security.tem_tela(ARRAY['financeiro.receber'])));
CREATE POLICY rls_atualizar ON public.lancamentos FOR UPDATE TO plugga_runtime
  USING ((tipo = 'saida' AND plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao']))
    OR (tipo = 'entrada' AND plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])))
  WITH CHECK ((tipo = 'saida' AND plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao']))
    OR (tipo = 'entrada' AND plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])));

-- Nome dos clientes para o Financeiro, que não lê `clients` (é do CRM): só id e
-- nome, dos clientes que um lançamento cobra ou, na busca, dos ativos.
CREATE FUNCTION plugga_security.clientes_para_financeiro(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.client_id = c.id))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;
REVOKE ALL ON FUNCTION plugga_security.clientes_para_financeiro(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.clientes_para_financeiro(text, uuid[]) TO plugga_runtime;

-- Diretório: a definição de 20261123040000_estoque, mais quem fez um marco de um
-- lançamento, para quem tem Financeiro.
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
    OR (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
      AND EXISTS (SELECT 1 FROM public.lancamentos l WHERE $1 IN (l.criado_por_id, l.aprovado_por_id, l.pagamento_registrado_por_id,
        l.recebimento_registrado_por_id, l.conciliado_por_id, l.cancelado_por_id)))
$fn$;

COMMIT;
