-- Remove o departamento Marketing (pedido do André em 22/11/2026).
--
-- Marketing só existia no catálogo de acesso (`packages/shared/src/acesso.ts`),
-- com uma tela "Campanhas" que nunca saiu do desenho. Quem tinha esse
-- departamento não alcançava nada além do item apagado na barra lateral.
--
-- Esta migração:
--   1. interrompe se houver identidade de IA de Marketing (ver abaixo);
--   2. apaga as concessões `marketing` de `user_departamentos`, a única tabela
--      que grava o departamento (`agent_identities` aponta para ela);
--   3. recria o catálogo do banco sem Marketing: o CHECK de departamento, a
--      função `plugga_security.telas_coerentes` e o CHECK que a usa.
--
-- Os baldes `plugga-marketing` e `waze-marketing` saem só das listas do código;
-- esta migração não toca o armazenamento.
--
-- Idempotente: rodar de novo sobre o banco já limpo não muda nada.

BEGIN;

-- Uma identidade de IA é membro de exatamente um departamento
-- (`validar_vinculos_usuario`) e tem histórico em `agent_actions` com
-- ON DELETE RESTRICT. Apagar a concessão dela quebraria esse vínculo, e
-- apagar ou mover o agente decidiria pelo André o destino de uma identidade
-- com histórico. Mesma regra de `remove_acesso_antigo`: legado incoerente
-- interrompe a migração e pede saneamento humano.
DO $preflight$
DECLARE quantidade bigint;
BEGIN
  SELECT count(*) INTO quantidade FROM public.agent_identities WHERE departamento = 'marketing';
  IF quantidade > 0 THEN
    RAISE EXCEPTION 'Preflight: % identidades de IA no departamento marketing; requer saneamento humano', quantidade;
  END IF;

  -- Pessoas que ficarão sem departamento nenhum. Não bloqueia: Marketing não
  -- dava acesso a tela real, então o alcance efetivo delas não muda. Fica
  -- registrado no log da migração para a equipe revisar o acesso.
  SELECT count(*) INTO quantidade
  FROM public.user_departamentos d
  WHERE d.departamento = 'marketing'
    AND NOT EXISTS (SELECT 1 FROM public.user_departamentos outro WHERE outro.user_id = d.user_id AND outro.departamento <> 'marketing')
    AND NOT EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = d.user_id);
  IF quantidade > 0 THEN
    RAISE NOTICE 'remove_departamento_marketing: % pessoas ficam sem departamento; revise o acesso na tela de Equipe', quantidade;
  END IF;
END $preflight$;

-- FORCE RLS também vale para o dono, que só tem SELECT em user_departamentos.
-- A policy de remoção vive só dentro desta transação e só alcança Marketing.
DROP POLICY IF EXISTS rls_remove_marketing_owner ON public.user_departamentos;
DO $policy$
BEGIN
  EXECUTE format(
    'CREATE POLICY rls_remove_marketing_owner ON public.user_departamentos FOR DELETE TO %I USING (departamento = %L)',
    current_user, 'marketing'
  );
END $policy$;

DELETE FROM public.user_departamentos WHERE departamento = 'marketing';

-- O DELETE enfileira os gatilhos adiados de coerência (`vinculos_coerentes`) e
-- a FK adiada de `agent_identities`. Rodá-los agora valida a remoção e libera
-- o ALTER TABLE abaixo, que o Postgres recusa com eventos pendentes.
SET CONSTRAINTS ALL IMMEDIATE;

DROP POLICY rls_remove_marketing_owner ON public.user_departamentos;

-- Sob RLS, um DELETE sem policy apagaria zero linhas em silêncio.
DO $conferencia$
DECLARE quantidade bigint;
BEGIN
  SELECT count(*) INTO quantidade FROM public.user_departamentos WHERE departamento = 'marketing';
  IF quantidade > 0 THEN
    RAISE EXCEPTION 'remove_departamento_marketing: % concessões marketing restaram', quantidade;
  END IF;
END $conferencia$;

-- Mesmo catálogo de `departamentos` em acesso.ts.
ALTER TABLE public.user_departamentos DROP CONSTRAINT IF EXISTS user_departamentos_departamento_check;
ALTER TABLE public.user_departamentos ADD CONSTRAINT user_departamentos_departamento_check CHECK (departamento IN (
  'crm', 'energia-opm', 'produto-tecnologia', 'financeiro',
  'suprimentos', 'engenharia-obras'
));

-- CREATE OR REPLACE preserva dono, grants (EXECUTE só para plugga_auth_runtime)
-- e a dependência do CHECK. O corpo é o de `vinculos_e_agentes` sem Marketing.
CREATE OR REPLACE FUNCTION plugga_security.telas_coerentes(p_departamento text, p_telas text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $2 IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest($2) t WHERE t IS NULL)
    AND cardinality($2) = (SELECT count(DISTINCT t) FROM unnest($2) t)
    AND coalesce($2 <@ CASE $1
      WHEN 'crm' THEN ARRAY['crm.pipelines', 'crm.clientes', 'crm.propostas', 'crm.contratos']
      WHEN 'energia-opm' THEN ARRAY['energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda']
      WHEN 'produto-tecnologia' THEN ARRAY['produto-tecnologia.pluggamob', 'produto-tecnologia.eletropostos', 'produto-tecnologia.recargas', 'produto-tecnologia.parceiros', 'produto-tecnologia.dashboards']
      WHEN 'financeiro' THEN ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']
      WHEN 'suprimentos' THEN ARRAY['suprimentos.compras', 'suprimentos.fornecedores', 'suprimentos.estoque']
      WHEN 'engenharia-obras' THEN ARRAY['engenharia-obras.obras', 'engenharia-obras.projetos', 'engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas', 'engenharia-obras.usinas', 'engenharia-obras.relatorios']
    END, false)
$fn$;
REVOKE ALL ON FUNCTION plugga_security.telas_coerentes(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.telas_coerentes(text, text[]) TO plugga_auth_runtime;

-- A função é IMMUTABLE: trocar o corpo não revalida as linhas existentes.
-- Recriar o CHECK revalida a tabela inteira com o catálogo novo.
ALTER TABLE public.user_departamentos DROP CONSTRAINT IF EXISTS user_departamentos_telas_coerentes;
ALTER TABLE public.user_departamentos ADD CONSTRAINT user_departamentos_telas_coerentes
  CHECK (plugga_security.telas_coerentes(departamento, telas));

COMMIT;
