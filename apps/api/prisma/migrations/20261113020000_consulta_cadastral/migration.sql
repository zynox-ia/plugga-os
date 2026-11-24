-- Integrações de plataforma moram em `segredos_do_sistema` com prefixo de chave
-- `email.`, `google.` ou `integracao.`. A política anterior cobria só `email.`:
-- o segredo `google.oauth` ficava aberto ao admin no banco (a API já o barrava).
-- Agora os três prefixos exigem desenvolvedor na leitura e na gravação.
--
-- Consulta de CNPJ e CEP: uma linha `integracao.cadastro` significa "ligada".
-- Quem consulta é qualquer pessoa logada, que não alcança a tabela; ela
-- pergunta só "está ligada?" por esta função, que não devolve o conteúdo.
BEGIN;

DROP POLICY rls_segredos ON public.segredos_do_sistema;

CREATE POLICY rls_segredos ON public.segredos_do_sistema TO plugga_runtime
  USING (plugga_security.plataforma(chave ~ '^(email|google|integracao)\.'))
  WITH CHECK (plugga_security.plataforma(chave ~ '^(email|google|integracao)\.'));

CREATE FUNCTION plugga_security.integracao_ativa(p_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.usuario_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.segredos_do_sistema s WHERE s.chave = 'integracao.' || p_id)
$fn$;

REVOKE ALL ON FUNCTION plugga_security.integracao_ativa(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.integracao_ativa(text) TO plugga_runtime;

COMMIT;
