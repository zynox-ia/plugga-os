-- Conciliação (PLU-339), fatia C6: a transferência entre duas contas da mesma empresa.
--
-- A transferência tem número próprio (TR-0001) e duas pernas em `lancamentos`, com a origem
-- `transferencia`: a saída na conta de origem, já paga, e a entrada na de destino, já recebida,
-- com o mesmo valor e o mesmo dia. Sem tipo novo: cada perna é um lançamento liquidado da sua
-- conta, conciliável com o extrato dela. Não é receita nem despesa: sem fornecedor, cliente,
-- categoria nem competência, sem a aprovação F2, e fora dos cards do Financeiro (na aplicação).
--
-- - As pernas levam o número da transferência, não o da sequência de CP/CR: o índice único de
--   (tipo, número) passa a valer só fora das transferências, e uma perna de cada tipo por
--   transferência.
-- - O gatilho da numeração confere a perna contra a transferência: conta, valor e dia.
-- - Depois de criadas, conta, valor, dias e o cancelamento das pernas não mudam (o par não
--   diverge); conciliar e desfazer a conciliação continuam.
-- - Só a gerência do Financeiro cria (RLS de INSERT das duas tabelas). Nada se apaga.
BEGIN;

-- ---------------------------------------------------------------- a transferência
CREATE SEQUENCE public.transferencias_numero_seq AS integer;
CREATE TABLE public.transferencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.transferencias_numero_seq'),
  company_id text NOT NULL,
  conta_origem_id uuid NOT NULL,
  conta_destino_id uuid NOT NULL,
  valor numeric(14,2) NOT NULL,
  -- Início do dia de Manaus.
  dia timestamptz(6) NOT NULL,
  descricao text NOT NULL,
  criada_por_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transferencias_pkey PRIMARY KEY (id),
  CONSTRAINT transferencias_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT transferencias_conta_origem_fkey FOREIGN KEY (conta_origem_id, company_id) REFERENCES public.contas_correntes(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT transferencias_conta_destino_fkey FOREIGN KEY (conta_destino_id, company_id) REFERENCES public.contas_correntes(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT transferencias_criada_por_id_fkey FOREIGN KEY (criada_por_id) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT transferencias_contas_distintas CHECK (conta_origem_id <> conta_destino_id),
  CONSTRAINT transferencias_valor_positivo CHECK (valor > 0),
  CONSTRAINT transferencias_descricao_preenchida CHECK (length(btrim(descricao)) > 0)
);
ALTER SEQUENCE public.transferencias_numero_seq OWNED BY public.transferencias.numero;
CREATE UNIQUE INDEX transferencias_numero_key ON public.transferencias (numero);
CREATE UNIQUE INDEX transferencias_id_company_id_key ON public.transferencias (id, company_id);
CREATE INDEX transferencias_conta_origem_id_idx ON public.transferencias (conta_origem_id);
CREATE INDEX transferencias_conta_destino_id_idx ON public.transferencias (conta_destino_id);

ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.transferencias FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
GRANT SELECT ON public.transferencias TO plugga_runtime;
GRANT INSERT (company_id, conta_origem_id, conta_destino_id, valor, dia, descricao, criada_por_id, created_at) ON public.transferencias TO plugga_runtime;
GRANT USAGE ON SEQUENCE public.transferencias_numero_seq TO plugga_runtime;
CREATE POLICY rls_ler ON public.transferencias FOR SELECT TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])));
CREATE POLICY rls_gerencia_inserir ON public.transferencias FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao'], true)));
DO $dono$
BEGIN
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.transferencias FOR SELECT TO %I USING (true)', current_user);
END $dono$;

-- ---------------------------------------------------------------- as pernas
ALTER TABLE public.lancamentos
  ADD COLUMN transferencia_id uuid,
  ADD CONSTRAINT lancamentos_transferencia_da_empresa_fkey FOREIGN KEY (transferencia_id, company_id)
    REFERENCES public.transferencias(id, company_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT lancamentos_transferencia_coerente CHECK ((origem = 'transferencia') = (transferencia_id IS NOT NULL)
    AND (transferencia_id IS NULL OR (fornecedor_id IS NULL AND client_id IS NULL AND categoria_id IS NULL AND competencia IS NULL
      AND conta_corrente_id IS NOT NULL AND pedido_de_compra_id IS NULL))) NOT VALID;
CREATE UNIQUE INDEX lancamentos_transferencia_tipo_key ON public.lancamentos (transferencia_id, tipo) WHERE transferencia_id IS NOT NULL;

-- O número: o de CP/CR é único fora das transferências; a perna leva o da transferência.
DROP INDEX public.lancamentos_tipo_numero_key;
CREATE UNIQUE INDEX lancamentos_tipo_numero_key ON public.lancamentos (tipo, numero) WHERE origem <> 'transferencia';

-- As regras da saída e da entrada abrem só para a perna (sem fornecedor, cliente, competência
-- nem categoria), e a aprovação e o "nasce liquidado" passam a valer para ela também. Todas
-- afrouxam as anteriores: entram NOT VALID e são validadas aqui, sem trava que pare a gravação.
ALTER TABLE public.lancamentos
  DROP CONSTRAINT lancamentos_saida_coerente,
  DROP CONSTRAINT lancamentos_entrada_coerente,
  DROP CONSTRAINT lancamentos_entrada_com_categoria,
  DROP CONSTRAINT lancamentos_aprovacao_coerente,
  DROP CONSTRAINT lancamentos_nasce_liquidado;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_saida_coerente CHECK (tipo <> 'saida' OR ((fornecedor_id IS NOT NULL OR origem = 'transferencia') AND client_id IS NULL AND competencia IS NULL
    AND etapa IN ('aberta', 'aprovada', 'paga', 'conciliada') AND recebido_em IS NULL AND valor_recebido IS NULL)) NOT VALID,
  ADD CONSTRAINT lancamentos_entrada_coerente CHECK (tipo <> 'entrada' OR ((origem = 'transferencia' OR (client_id IS NOT NULL AND competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'))
    AND fornecedor_id IS NULL AND etapa IN ('gerada', 'nf_emitida', 'boleto_gerado', 'enviada', 'recebida', 'conciliada') AND pago_em IS NULL AND pedido_de_compra_id IS NULL)) NOT VALID,
  ADD CONSTRAINT lancamentos_entrada_com_categoria CHECK (tipo = 'saida' OR categoria_id IS NOT NULL OR origem = 'transferencia') NOT VALID,
  ADD CONSTRAINT lancamentos_aprovacao_coerente CHECK (tipo <> 'saida' OR etapa = 'aberta' OR aprovado_em IS NOT NULL OR cancelado_em IS NOT NULL
    OR origem IN ('tarifa_bancaria', 'conciliacao', 'transferencia')) NOT VALID,
  ADD CONSTRAINT lancamentos_nasce_liquidado CHECK (origem NOT IN ('tarifa_bancaria', 'conciliacao', 'transferencia') OR pago_em IS NOT NULL OR recebido_em IS NOT NULL) NOT VALID;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_transferencia_coerente;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_saida_coerente;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_entrada_coerente;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_entrada_com_categoria;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_aprovacao_coerente;
ALTER TABLE public.lancamentos VALIDATE CONSTRAINT lancamentos_nasce_liquidado;

-- A numeração: a perna leva o número da transferência e tem de bater com ela.
CREATE OR REPLACE FUNCTION public.lancamentos_numerar() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $fn$
DECLARE t record;
BEGIN
  IF NEW.origem = 'transferencia' THEN
    SELECT tr.numero, tr.conta_origem_id, tr.conta_destino_id, tr.valor, tr.dia INTO t FROM public.transferencias tr WHERE tr.id = NEW.transferencia_id;
    IF NOT FOUND
      OR NEW.conta_corrente_id IS DISTINCT FROM (CASE NEW.tipo WHEN 'saida' THEN t.conta_origem_id ELSE t.conta_destino_id END)
      OR NEW.valor <> t.valor OR coalesce(NEW.valor_recebido, NEW.valor) <> t.valor
      OR coalesce(NEW.pago_em, NEW.recebido_em) IS DISTINCT FROM t.dia THEN
      RAISE EXCEPTION 'a perna não confere com a transferência (conta, valor e dia)' USING ERRCODE = 'check_violation';
    END IF;
    NEW.numero := t.numero;
  ELSE
    NEW.numero := CASE NEW.tipo WHEN 'saida' THEN nextval('public.lancamentos_saida_numero_seq') ELSE nextval('public.lancamentos_entrada_numero_seq') END;
  END IF;
  RETURN NEW;
END
$fn$;

-- O que não muda: o de sempre, a transferência da perna e, na perna, conta, valor, dias e o cancelamento.
CREATE OR REPLACE FUNCTION public.lancamentos_imutaveis() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.tipo <> OLD.tipo OR NEW.numero <> OLD.numero OR NEW.company_id <> OLD.company_id
    OR NEW.origem <> OLD.origem OR NEW.pedido_de_compra_id IS DISTINCT FROM OLD.pedido_de_compra_id
    OR NEW.transferencia_id IS DISTINCT FROM OLD.transferencia_id THEN
    RAISE EXCEPTION 'tipo, número, empresa e origem do lançamento não mudam' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.origem = 'transferencia' AND (NEW.valor <> OLD.valor OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido
    OR NEW.conta_corrente_id IS DISTINCT FROM OLD.conta_corrente_id OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
    OR NEW.recebido_em IS DISTINCT FROM OLD.recebido_em OR NEW.vencimento <> OLD.vencimento OR NEW.cancelado_em IS DISTINCT FROM OLD.cancelado_em) THEN
    RAISE EXCEPTION 'a perna de uma transferência não muda: conta, valor e dia são os da transferência' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

-- Quem cria as pernas: a gerência do Financeiro (a política permissiva) e só ela (a restritiva,
-- que vale contra a de Contas a pagar e a de Contas a receber).
CREATE POLICY rls_transferencia_inserir ON public.lancamentos FOR INSERT TO plugga_runtime WITH CHECK (
  origem = 'transferencia' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao'], true)));
CREATE POLICY rls_transferencia_restrita ON public.lancamentos AS RESTRICTIVE FOR INSERT TO plugga_runtime WITH CHECK (
  origem <> 'transferencia' OR (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao'], true)));

COMMIT;
