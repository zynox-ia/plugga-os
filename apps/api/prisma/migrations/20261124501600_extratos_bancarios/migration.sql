-- Conciliação (PLU-339), fatia C1: o extrato bancário entra por arquivo (OFX) e vira
-- movimentos da conta corrente. O Plugga OS é o dono do financeiro (decisão de 24/11/2026):
-- o extrato vem do banco, não do OMIE.
--
-- - `extratos_bancarios`: um por arquivo importado. O original fica no armazenamento,
--   numa chave isolada por empresa; o mesmo arquivo (sha256) não entra duas vezes na conta.
-- - `movimentos_do_extrato`: as linhas, com o valor com sinal (+ crédito, − débito). O
--   identificador do banco (FITID) é único por conta, então extratos que se sobrepõem não
--   duplicam movimento.
-- Nada se apaga: sem DELETE para ninguém. Quem tem a tela Conciliação lê e importa; a
-- conciliação (UPDATE do estado) vem na C3. A empresa é a da conta (chave composta).
BEGIN;

CREATE TABLE public.extratos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  conta_corrente_id uuid NOT NULL,
  origem text NOT NULL,
  arquivo_chave text NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_tamanho integer NOT NULL,
  arquivo_sha256 text NOT NULL,
  periodo_de timestamptz(6) NOT NULL,
  periodo_ate timestamptz(6) NOT NULL,
  saldo_informado numeric(14, 2),
  saldo_informado_em timestamptz(6),
  movimentos integer NOT NULL,
  novos integer NOT NULL,
  importado_por_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  importado_em timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT extratos_bancarios_da_empresa_fkey FOREIGN KEY (conta_corrente_id, company_id)
    REFERENCES public.contas_correntes(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT extratos_bancarios_origem_valida CHECK (origem IN ('ofx', 'csv')),
  CONSTRAINT extratos_bancarios_sha256 CHECK (arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT extratos_bancarios_periodo CHECK (periodo_de <= periodo_ate),
  CONSTRAINT extratos_bancarios_saldo_com_dia CHECK ((saldo_informado IS NULL) = (saldo_informado_em IS NULL)),
  CONSTRAINT extratos_bancarios_contagens CHECK (movimentos >= 0 AND novos BETWEEN 0 AND movimentos),
  -- A chave do arquivo é da empresa: financeiro/extratos/<empresa>/...
  CONSTRAINT extratos_bancarios_chave_da_empresa CHECK (arquivo_chave LIKE 'financeiro/extratos/' || company_id || '/%')
);
CREATE UNIQUE INDEX extratos_bancarios_conta_arquivo_key ON public.extratos_bancarios (conta_corrente_id, arquivo_sha256);
CREATE UNIQUE INDEX extratos_bancarios_id_company_id_key ON public.extratos_bancarios (id, company_id);
CREATE INDEX extratos_bancarios_company_id_idx ON public.extratos_bancarios (company_id);
CREATE INDEX extratos_bancarios_importado_por_id_idx ON public.extratos_bancarios (importado_por_id);

CREATE TABLE public.movimentos_do_extrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  conta_corrente_id uuid NOT NULL,
  extrato_id uuid NOT NULL,
  -- O início do dia de Manaus, como o vencimento.
  dia timestamptz(6) NOT NULL,
  valor numeric(14, 2) NOT NULL,
  descricao text NOT NULL,
  identificador text NOT NULL,
  estado text NOT NULL DEFAULT 'pendente',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT movimentos_do_extrato_da_empresa_fkey FOREIGN KEY (conta_corrente_id, company_id)
    REFERENCES public.contas_correntes(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentos_do_extrato_do_extrato_fkey FOREIGN KEY (extrato_id, company_id)
    REFERENCES public.extratos_bancarios(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT movimentos_do_extrato_valor CHECK (valor <> 0),
  CONSTRAINT movimentos_do_extrato_descricao CHECK (length(descricao) BETWEEN 1 AND 255),
  CONSTRAINT movimentos_do_extrato_identificador CHECK (length(identificador) BETWEEN 1 AND 120),
  CONSTRAINT movimentos_do_extrato_estado_valido CHECK (estado IN ('pendente', 'conciliado', 'marcado'))
);
CREATE UNIQUE INDEX movimentos_do_extrato_conta_identificador_key ON public.movimentos_do_extrato (conta_corrente_id, identificador);
CREATE INDEX movimentos_do_extrato_conta_dia_idx ON public.movimentos_do_extrato (conta_corrente_id, dia);
CREATE INDEX movimentos_do_extrato_extrato_id_idx ON public.movimentos_do_extrato (extrato_id);
CREATE INDEX movimentos_do_extrato_company_id_idx ON public.movimentos_do_extrato (company_id);

-- ------------------------------------------------------------ RLS
DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['extratos_bancarios', 'movimentos_do_extrato'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format($p$CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime
      USING ((SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'])))$p$, tabela);
    EXECUTE format($p$CREATE POLICY rls_importar ON public.%I FOR INSERT TO plugga_runtime
      WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['financeiro.conciliacao'])))$p$, tabela);
  END LOOP;
END $tabelas$;

GRANT SELECT ON public.extratos_bancarios, public.movimentos_do_extrato TO plugga_runtime;
GRANT INSERT (company_id, conta_corrente_id, origem, arquivo_chave, arquivo_nome, arquivo_tamanho, arquivo_sha256, periodo_de, periodo_ate,
  saldo_informado, saldo_informado_em, movimentos, novos, importado_por_id, importado_em) ON public.extratos_bancarios TO plugga_runtime;
GRANT INSERT (company_id, conta_corrente_id, extrato_id, dia, valor, descricao, identificador, created_at) ON public.movimentos_do_extrato TO plugga_runtime;

COMMIT;
