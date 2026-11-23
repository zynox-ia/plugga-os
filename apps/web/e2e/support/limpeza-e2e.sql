-- Limpeza do que UMA execução dos e2e criou, pelo runId no nome ("E2E <runId>").
-- Roda no globalTeardown do Playwright, pelo psql, numa transação só:
--
--   psql "$E2E_CLEANUP_DATABASE_URL" -v ON_ERROR_STOP=1 -v run="$E2E_RUN_ID" \
--        -v limpeza_permitida=sim -1 -f e2e/support/limpeza-e2e.sql
--
-- Só para o banco LOCAL (127.0.0.1/localhost, portas 55432 e 55433) ou o da CI. O
-- hook confere o host e a porta da URL antes de chamar e passa
-- `limpeza_permitida=sim`; o SQL confere de novo o nome do banco e o runId.
-- Nunca apaga o que não tem o runId: os exemplos do QA ("(sintético)" sem
-- "E2E <id>") ficam. O event_log não é tocado. Devolve as chaves dos arquivos
-- (cotações e comprovantes) para quem quiser limpar o bucket local.

\set ON_ERROR_STOP on

SELECT set_config('e2e.run', :'run', true), set_config('e2e.permitida', :'limpeza_permitida', true);

DO $guarda$
BEGIN
  IF current_setting('e2e.permitida', true) IS DISTINCT FROM 'sim' THEN
    RAISE EXCEPTION 'limpeza dos e2e sem permissão do hook';
  END IF;
  IF current_database() NOT IN ('plugga_os', 'plugga_os_test') THEN
    RAISE EXCEPTION 'limpeza dos e2e só no banco local ou da CI (banco: %)', current_database();
  END IF;
  IF current_setting('e2e.run', true) !~ '^[A-Za-z0-9_-]{6,40}$' THEN
    RAISE EXCEPTION 'runId inválido';
  END IF;
END $guarda$;

-- Os triggers de evidência (movimentação só de inserção, comprovante só substitui)
-- ficam desligados só nesta transação.
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE e2e_marca ON COMMIT DROP AS SELECT 'E2E ' || current_setting('e2e.run') AS marca;
CREATE TEMP TABLE e2e_ped ON COMMIT DROP AS
  SELECT id FROM pedidos_de_compra WHERE strpos(titulo, (SELECT marca FROM e2e_marca)) > 0;
CREATE TEMP TABLE e2e_item ON COMMIT DROP AS
  SELECT id FROM itens_de_estoque WHERE strpos(nome, (SELECT marca FROM e2e_marca)) > 0;
CREATE TEMP TABLE e2e_forn ON COMMIT DROP AS
  SELECT id FROM fornecedores WHERE strpos(nome, (SELECT marca FROM e2e_marca)) > 0;
CREATE TEMP TABLE e2e_lanc ON COMMIT DROP AS
  SELECT id FROM lancamentos WHERE strpos(descricao, (SELECT marca FROM e2e_marca)) > 0
     OR pedido_de_compra_id IN (SELECT id FROM e2e_ped)
     OR fornecedor_id IN (SELECT id FROM e2e_forn);

-- Um registro de outra execução (ou de exemplo) que dependa deste run: aborta tudo.
DO $dependentes$
BEGIN
  IF EXISTS (SELECT 1 FROM cotacoes_de_compra WHERE fornecedor_id IN (SELECT id FROM e2e_forn) AND pedido_id NOT IN (SELECT id FROM e2e_ped))
    OR EXISTS (SELECT 1 FROM itens_de_pedido WHERE item_de_estoque_id IN (SELECT id FROM e2e_item) AND pedido_id NOT IN (SELECT id FROM e2e_ped))
    OR EXISTS (SELECT 1 FROM movimentacoes_de_estoque WHERE pedido_id IN (SELECT id FROM e2e_ped) AND item_id NOT IN (SELECT id FROM e2e_item))
    OR EXISTS (SELECT 1 FROM reservas_de_estoque WHERE pedido_id IN (SELECT id FROM e2e_ped) AND item_id NOT IN (SELECT id FROM e2e_item)) THEN
    RAISE EXCEPTION 'um registro fora deste run depende dele: nada foi apagado';
  END IF;
END $dependentes$;

-- As chaves dos arquivos, antes de apagar as linhas.
SELECT 'arquivo' AS tipo, arquivo_chave FROM cotacoes_de_compra WHERE pedido_id IN (SELECT id FROM e2e_ped)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM comprovantes_de_pagamento WHERE pedido_id IN (SELECT id FROM e2e_ped);

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

SELECT (SELECT count(*) FROM e2e_lanc) AS lancamentos, (SELECT count(*) FROM e2e_ped) AS pedidos,
       (SELECT count(*) FROM e2e_item) AS itens_de_estoque, (SELECT count(*) FROM e2e_forn) AS fornecedores;
