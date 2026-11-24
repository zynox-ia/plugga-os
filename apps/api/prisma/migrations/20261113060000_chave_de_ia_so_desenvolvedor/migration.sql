-- A chave de IA (`openrouter.api_key`) é infraestrutura da plataforma, como as
-- demais integrações: sai da aba de Chave de IA e vira um cartão da tela do
-- Desenvolvedor. A política de segredos passa a exigir desenvolvedor também para o
-- prefixo `openrouter.`. A leitura da chave para a fatura segue pela função
-- `plugga_security.chave_fatura()`, que devolve só o texto cifrado e não depende
-- desta política.
BEGIN;

DROP POLICY rls_segredos ON public.segredos_do_sistema;

CREATE POLICY rls_segredos ON public.segredos_do_sistema TO plugga_runtime
  USING (plugga_security.plataforma(chave ~ '^(email|google|integracao|openrouter)\.'))
  WITH CHECK (plugga_security.plataforma(chave ~ '^(email|google|integracao|openrouter)\.'));

COMMIT;
