-- Limpeza do que UMA execução dos e2e criou, pelo runId no nome ("E2E <runId>").
-- Roda no globalTeardown do Playwright, pelo psql, numa transação só:
--
--   psql "$E2E_CLEANUP_DATABASE_URL" -v ON_ERROR_STOP=1 -v run="$E2E_RUN_ID" \
--        -v limpeza_permitida=sim -1 -f e2e/support/limpeza-e2e.sql
--
-- Só para o banco LOCAL (127.0.0.1/localhost, portas 55432 e 55433) ou o da CI. O
-- hook confere o host e a porta da URL antes de chamar e passa
-- `limpeza_permitida=sim`; o SQL confere de novo o marcador `plugga.ambiente =
-- 'local'` do banco, o nome do banco e o runId.
-- Nunca apaga o que não tem o runId: os exemplos do QA ("(sintético)" sem
-- "E2E <id>") ficam. O event_log não é tocado. Devolve as chaves dos arquivos
-- (cotações e comprovantes) para quem quiser limpar o bucket local. Precisa do papel
-- dono das tabelas (ALTER TABLE … DISABLE TRIGGER).

\set ON_ERROR_STOP on

SELECT set_config('e2e.run', :'run', true), set_config('e2e.permitida', :'limpeza_permitida', true);

DO $guarda$
BEGIN
  IF current_setting('e2e.permitida', true) IS DISTINCT FROM 'sim' THEN
    RAISE EXCEPTION 'limpeza dos e2e sem permissão do hook';
  END IF;
  -- Marcador que só existe nos bancos locais (ALTER DATABASE … SET plugga.ambiente =
  -- 'local', feito à mão no 55432 e no 55433; nunca em migration). A produção não o tem.
  IF current_setting('plugga.ambiente', true) IS DISTINCT FROM 'local' THEN
    RAISE EXCEPTION 'limpeza dos e2e só em banco marcado como local (plugga.ambiente)'
      USING HINT = format('No banco LOCAL, como dono: ALTER DATABASE %I SET plugga.ambiente = ''local''; (o 55433 já sai marcado de "node scripts/local-test.mjs up")', current_database());
  END IF;
  IF current_database() NOT IN ('plugga_os', 'plugga_os_test') THEN
    RAISE EXCEPTION 'limpeza dos e2e só no banco local ou da CI (banco: %)', current_database();
  END IF;
  IF current_setting('e2e.run', true) !~ '^[A-Za-z0-9_-]{6,40}$' THEN
    RAISE EXCEPTION 'runId inválido';
  END IF;
END $guarda$;

-- Só os triggers de evidência (movimentação e linha do tempo só de inserção,
-- comprovante e anexo só substituem) ficam desligados, pelo nome e só nesta transação: as chaves
-- estrangeiras continuam valendo, então qualquer registro de fora do run que
-- aponte para o que se apaga aborta tudo. São religados antes do fim; um erro no
-- meio desfaz também o desligamento.
ALTER TABLE movimentacoes_de_estoque DISABLE TRIGGER movimentacoes_de_estoque_append_only;
ALTER TABLE comprovantes_de_pagamento DISABLE TRIGGER comprovantes_de_pagamento_so_substitui;
ALTER TABLE anexos_de_lancamento DISABLE TRIGGER anexos_de_lancamento_so_substitui;
ALTER TABLE historico_de_lancamento DISABLE TRIGGER historico_de_lancamento_append_only;

-- "E2E <run>" ancorado no fim: o run abc123 não casa "E2E abc1234". O runId é só
-- [A-Za-z0-9_-] (conferido acima), então pode entrar na expressão sem escape.
CREATE TEMP TABLE e2e_marca ON COMMIT DROP AS SELECT '(^|[^A-Za-z0-9_-])E2E ' || current_setting('e2e.run') || '([^A-Za-z0-9_-]|$)' AS marca;
CREATE TEMP TABLE e2e_ped ON COMMIT DROP AS
  SELECT id FROM pedidos_de_compra WHERE titulo ~ (SELECT marca FROM e2e_marca);
CREATE TEMP TABLE e2e_item ON COMMIT DROP AS
  SELECT id FROM itens_de_estoque WHERE nome ~ (SELECT marca FROM e2e_marca);
CREATE TEMP TABLE e2e_forn ON COMMIT DROP AS
  SELECT id FROM fornecedores WHERE nome ~ (SELECT marca FROM e2e_marca);
-- Só o lançamento com a marca; um sem a marca ligado ao run aborta (abaixo).
CREATE TEMP TABLE e2e_lanc ON COMMIT DROP AS
  SELECT id FROM lancamentos WHERE descricao ~ (SELECT marca FROM e2e_marca);

-- Um registro de outra execução (ou de exemplo) que dependa deste run: aborta tudo.
DO $dependentes$
BEGIN
  IF EXISTS (SELECT 1 FROM cotacoes_de_compra WHERE fornecedor_id IN (SELECT id FROM e2e_forn) AND pedido_id NOT IN (SELECT id FROM e2e_ped))
    OR EXISTS (SELECT 1 FROM itens_de_pedido WHERE item_de_estoque_id IN (SELECT id FROM e2e_item) AND pedido_id NOT IN (SELECT id FROM e2e_ped))
    OR EXISTS (SELECT 1 FROM movimentacoes_de_estoque WHERE pedido_id IN (SELECT id FROM e2e_ped) AND item_id NOT IN (SELECT id FROM e2e_item))
    OR EXISTS (SELECT 1 FROM reservas_de_estoque WHERE pedido_id IN (SELECT id FROM e2e_ped) AND item_id NOT IN (SELECT id FROM e2e_item))
    OR EXISTS (SELECT 1 FROM lancamentos WHERE (pedido_de_compra_id IN (SELECT id FROM e2e_ped) OR fornecedor_id IN (SELECT id FROM e2e_forn))
      AND id NOT IN (SELECT id FROM e2e_lanc)) THEN
    RAISE EXCEPTION 'um registro fora deste run depende dele: nada foi apagado';
  END IF;
END $dependentes$;

-- As chaves dos arquivos, antes de apagar as linhas.
SELECT 'arquivo' AS tipo, arquivo_chave FROM cotacoes_de_compra WHERE pedido_id IN (SELECT id FROM e2e_ped)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM comprovantes_de_pagamento WHERE pedido_id IN (SELECT id FROM e2e_ped)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM anexos_de_lancamento WHERE lancamento_id IN (SELECT id FROM e2e_lanc);

-- O que pende do lançamento (PLU-337) sai antes dele: anexos, linha do tempo e UCs.
DELETE FROM anexos_de_lancamento WHERE lancamento_id IN (SELECT id FROM e2e_lanc);
DELETE FROM historico_de_lancamento WHERE lancamento_id IN (SELECT id FROM e2e_lanc);
DELETE FROM ucs_de_lancamento WHERE lancamento_id IN (SELECT id FROM e2e_lanc);
DELETE FROM lancamentos WHERE id IN (SELECT id FROM e2e_lanc);
DELETE FROM movimentacoes_de_estoque WHERE item_id IN (SELECT id FROM e2e_item) OR pedido_id IN (SELECT id FROM e2e_ped);
DELETE FROM reservas_de_estoque WHERE item_id IN (SELECT id FROM e2e_item) OR pedido_id IN (SELECT id FROM e2e_ped);
UPDATE pedidos_de_compra SET cotacao_selecionada_id = NULL WHERE id IN (SELECT id FROM e2e_ped);
DELETE FROM comprovantes_de_pagamento WHERE pedido_id IN (SELECT id FROM e2e_ped);
DELETE FROM cotacoes_de_compra WHERE pedido_id IN (SELECT id FROM e2e_ped);
DELETE FROM pedidos_de_compra_etapas WHERE pedido_id IN (SELECT id FROM e2e_ped);
DELETE FROM itens_de_pedido WHERE pedido_id IN (SELECT id FROM e2e_ped);
DELETE FROM pedidos_de_compra WHERE id IN (SELECT id FROM e2e_ped);
DELETE FROM itens_de_estoque WHERE id IN (SELECT id FROM e2e_item);
DELETE FROM fornecedores WHERE id IN (SELECT id FROM e2e_forn);

ALTER TABLE movimentacoes_de_estoque ENABLE TRIGGER movimentacoes_de_estoque_append_only;
ALTER TABLE comprovantes_de_pagamento ENABLE TRIGGER comprovantes_de_pagamento_so_substitui;
ALTER TABLE anexos_de_lancamento ENABLE TRIGGER anexos_de_lancamento_so_substitui;
ALTER TABLE historico_de_lancamento ENABLE TRIGGER historico_de_lancamento_append_only;

SELECT (SELECT count(*) FROM e2e_lanc) AS lancamentos, (SELECT count(*) FROM e2e_ped) AS pedidos,
       (SELECT count(*) FROM e2e_item) AS itens_de_estoque, (SELECT count(*) FROM e2e_forn) AS fornecedores;
