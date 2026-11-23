-- OMIE por empresa (PLU-342): uma conta OMIE com a Plugga e a Waze dentro, um
-- par app_key/app_secret por empresa no cofre (`integracao.omie.<empresa>`).
--
-- O par só é usado depois de conferido: o teste chama ListarEmpresas e o
-- resultado fica em `omie_conexoes`, junto da confirmação. O CNPJ de referência
-- é o da empresa no Plugga OS (`companies.cnpj`, preenchido pela plataforma);
-- sem ele, alguém confirma na tela. A conta única de antes (`integracao.omie`)
-- não é tocada: o cartão pede para reconectar por empresa.

BEGIN;

-- 1. CNPJ da empresa no Plugga OS. Só a plataforma grava, pela função abaixo.
ALTER TABLE public.companies ADD COLUMN cnpj text;
ALTER TABLE public.companies ADD CONSTRAINT companies_cnpj_formato CHECK (cnpj IS NULL OR cnpj ~ '^\d{14}$');
CREATE UNIQUE INDEX companies_cnpj_key ON public.companies (cnpj) WHERE cnpj IS NOT NULL;

CREATE FUNCTION plugga_security.definir_cnpj_da_empresa(p_empresa text, p_cnpj text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF NOT plugga_security.plataforma() THEN
    RAISE EXCEPTION 'só Admin e Desenvolvedor definem o CNPJ da empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.companies SET cnpj = p_cnpj WHERE id = p_empresa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa desconhecida' USING ERRCODE = 'no_data_found';
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.definir_cnpj_da_empresa(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.definir_cnpj_da_empresa(text, text) TO plugga_runtime;

-- 2. A conferência de cada par: o último teste, o bloqueio e a confirmação. Vale
-- só para a versão do par em `segredo_atualizado_em`; trocar o par zera tudo.
CREATE TABLE public.omie_conexoes (
  company_id text NOT NULL,
  segredo_atualizado_em timestamptz(6) NOT NULL,
  ultimo_teste_em timestamptz(6),
  ultimo_teste_por_id uuid,
  -- [{ razaoSocial, nomeFantasia, cnpj }] como o OMIE devolveu. Dados da própria empresa, sem segredo.
  ultimo_teste jsonb,
  bloqueio text,
  confirmada_em timestamptz(6),
  confirmada_por_id uuid,
  cnpj_confirmado text,
  razao_social_confirmada text,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT omie_conexoes_pkey PRIMARY KEY (company_id),
  CONSTRAINT omie_conexoes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT omie_conexoes_ultimo_teste_por_id_fkey FOREIGN KEY (ultimo_teste_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT omie_conexoes_confirmada_por_id_fkey FOREIGN KEY (confirmada_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT omie_conexoes_bloqueio_valido CHECK (bloqueio IS NULL OR bloqueio IN ('mais_de_uma_empresa', 'cnpj_de_outra_empresa', 'cnpj_diferente_do_cadastro', 'sem_cnpj')),
  CONSTRAINT omie_conexoes_teste_coerente CHECK ((ultimo_teste_em IS NULL) = (ultimo_teste IS NULL)),
  -- Confirmada exige teste, sem bloqueio, e o CNPJ confirmado.
  CONSTRAINT omie_conexoes_confirmacao_coerente CHECK (confirmada_em IS NULL OR (ultimo_teste_em IS NOT NULL AND bloqueio IS NULL AND cnpj_confirmado ~ '^\d{14}$'))
);

ALTER TABLE public.omie_conexoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omie_conexoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.omie_conexoes FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
DO $dono$ BEGIN
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.omie_conexoes FOR SELECT TO %I USING (true)', current_user);
END $dono$;
-- Quem gere o OMIE (D6): Desenvolvedor, Admin e Gerente do Financeiro. Sem DELETE.
GRANT SELECT, INSERT, UPDATE ON public.omie_conexoes TO plugga_runtime;
CREATE POLICY rls_gerir ON public.omie_conexoes TO plugga_runtime
  USING (plugga_security.plataforma() OR plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true))
  WITH CHECK (plugga_security.plataforma() OR plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true));

-- 3. O cofre: os pares do OMIE (por empresa e a conta única antiga, para o "Testar
-- e mover para a Plugga") também são de Admin e Gerente do Financeiro. As demais
-- chaves técnicas continuam só do Desenvolvedor (definição de
-- 20261113060000_chave_de_ia_so_desenvolvedor).
DROP POLICY rls_segredos ON public.segredos_do_sistema;
CREATE POLICY rls_segredos ON public.segredos_do_sistema TO plugga_runtime
  USING (plugga_security.plataforma(chave ~ '^(email|google|integracao|openrouter)\.')
    OR (chave ~ '^integracao\.omie(\.(plugga|waze))?$' AND (plugga_security.plataforma()
      OR plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true))))
  WITH CHECK (plugga_security.plataforma(chave ~ '^(email|google|integracao|openrouter)\.')
    OR (chave ~ '^integracao\.omie(\.(plugga|waze))?$' AND (plugga_security.plataforma()
      OR plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true))));

-- 4. Uso da conta (o envio e a leitura): só o texto cifrado do par CONFERIDO da
-- empresa, na versão que foi testada e confirmada. O par não conferido não sai.
CREATE FUNCTION plugga_security.config_omie(p_empresa text) RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  JOIN public.omie_conexoes c ON c.company_id = p_empresa
  WHERE p_empresa IN ('plugga', 'waze') AND s.chave = 'integracao.omie.' || p_empresa
    AND c.confirmada_em IS NOT NULL AND c.bloqueio IS NULL AND date_trunc('milliseconds', c.segredo_atualizado_em) = date_trunc('milliseconds', s.atualizado_em)
$fn$;
REVOKE ALL ON FUNCTION plugga_security.config_omie(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.config_omie(text) TO plugga_runtime, plugga_jobs_runtime;

COMMIT;
