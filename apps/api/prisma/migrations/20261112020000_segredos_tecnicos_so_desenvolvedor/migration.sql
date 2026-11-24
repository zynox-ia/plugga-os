-- Segredos de infraestrutura (chave lógica `email.*`, hoje o Brevo) só o
-- desenvolvedor lê ou grava. Até aqui a política deixava o admin entrar em
-- toda a tabela; a API já recusava o admin, mas o banco é a segunda trava.
-- As demais chaves (ex.: `openrouter.api_key`) continuam com o admin.
BEGIN;

DROP POLICY rls_plataforma ON public.segredos_do_sistema;

CREATE POLICY rls_segredos ON public.segredos_do_sistema TO plugga_runtime
  USING (plugga_security.plataforma(chave LIKE 'email.%'))
  WITH CHECK (plugga_security.plataforma(chave LIKE 'email.%'));

COMMIT;
