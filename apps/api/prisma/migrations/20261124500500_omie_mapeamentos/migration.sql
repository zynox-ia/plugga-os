-- O vínculo das categorias e das contas correntes com o OMIE sai do núcleo e vai para
-- o conector (PLU-342, S3a da separação: o Plugga OS é o dono do financeiro e o OMIE é
-- um conector desligável).
--
-- Fase de expansão. As tabelas do conector `omie_categorias` e `omie_contas_correntes`
-- nascem com o backfill:
--   - a conta corrente com `omie_codigo`;
--   - a categoria lida do OMIE (`lida_em` preenchido), cujo código hoje é o do OMIE.
-- O código hierárquico da categoria ("2.01.01") segue como padrão próprio do Plugga OS.
-- As colunas `contas_correntes.omie_codigo` e `categorias_financeiras.lida_em` saem na
-- contração, junto com as do S2.
--
-- A empresa do vínculo é a do cadastro (chave composta). O código do OMIE é único por
-- empresa. A aplicação só lê; a importação do OMIE (S4) é quem vai gravar.
BEGIN;

CREATE TABLE public.omie_categorias (
  categoria_id uuid PRIMARY KEY,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  omie_codigo text NOT NULL,
  lida_em timestamptz(6),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT omie_categorias_da_empresa_fkey FOREIGN KEY (categoria_id, company_id)
    REFERENCES public.categorias_financeiras(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT omie_categorias_codigo_curto CHECK (length(omie_codigo) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX omie_categorias_company_id_omie_codigo_key ON public.omie_categorias (company_id, omie_codigo);

CREATE TABLE public.omie_contas_correntes (
  conta_corrente_id uuid PRIMARY KEY,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  omie_codigo text NOT NULL,
  lida_em timestamptz(6),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT omie_contas_correntes_da_empresa_fkey FOREIGN KEY (conta_corrente_id, company_id)
    REFERENCES public.contas_correntes(id, company_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT omie_contas_correntes_codigo_curto CHECK (length(omie_codigo) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX omie_contas_correntes_company_id_omie_codigo_key ON public.omie_contas_correntes (company_id, omie_codigo);

-- backfill:inicio
-- Idempotente: o que já tem vínculo fica como está.
INSERT INTO public.omie_categorias (categoria_id, company_id, omie_codigo, lida_em)
SELECT c.id, c.company_id, c.codigo, c.lida_em
FROM public.categorias_financeiras c
WHERE c.lida_em IS NOT NULL
ON CONFLICT (categoria_id) DO NOTHING;

INSERT INTO public.omie_contas_correntes (conta_corrente_id, company_id, omie_codigo)
SELECT c.id, c.company_id, c.omie_codigo
FROM public.contas_correntes c
WHERE c.omie_codigo IS NOT NULL
ON CONFLICT (conta_corrente_id) DO NOTHING;
-- backfill:fim

-- ------------------------------------------------------------ RLS
-- Ligado depois do backfill: o dono não precisa de política de escrita.
DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['omie_categorias', 'omie_contas_correntes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format('GRANT SELECT ON public.%I TO plugga_runtime', tabela);
  END LOOP;
END $tabelas$;

-- A aplicação lê o vínculo de quem ela vê (o RLS do cadastro, que já é InitPlan).
CREATE POLICY rls_ler ON public.omie_categorias FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.categorias_financeiras c WHERE c.id = categoria_id));
CREATE POLICY rls_ler ON public.omie_contas_correntes FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.contas_correntes c WHERE c.id = conta_corrente_id));

COMMIT;
