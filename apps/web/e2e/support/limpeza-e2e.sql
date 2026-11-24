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
ALTER TABLE omie_envios DISABLE TRIGGER omie_envios_coerente;
-- Usinas do run (PLU-347): a O.S. aponta para a usina e a usina pode apontar para a
-- O.S. de comissionamento; o vínculo da O.S. é desfeito antes de apagar, só aqui.
ALTER TABLE ordens_de_servico DISABLE TRIGGER ordens_de_servico_encerrada_nao_muda;

-- "E2E <run>" ancorado no fim: o run abc123 não casa "E2E abc1234". O runId é só
-- [A-Za-z0-9_-] (conferido acima), então pode entrar na expressão sem escape.
CREATE TEMP TABLE e2e_marca ON COMMIT DROP AS SELECT '(^|[^A-Za-z0-9_-])E2E ' || current_setting('e2e.run') || '([^A-Za-z0-9_-]|$)' AS marca;
-- Usinas (PLU-347) com a marca no nome, e plataformas de inversor criadas pelo run.
CREATE TEMP TABLE e2e_usina ON COMMIT DROP AS
  SELECT id FROM usinas WHERE nome ~ (SELECT marca FROM e2e_marca);
CREATE TEMP TABLE e2e_plataforma ON COMMIT DROP AS
  SELECT id FROM plataformas_de_inversor WHERE nome ~ (SELECT marca FROM e2e_marca);
-- Conferências com ao menos uma usina do run; uma que tenha usina de fora aborta (abaixo).
CREATE TEMP TABLE e2e_conferencia ON COMMIT DROP AS
  SELECT DISTINCT conferencia_id AS id FROM resultados_da_conferencia WHERE usina_id IN (SELECT id FROM e2e_usina)
  UNION SELECT id FROM conferencias_de_plataforma WHERE plataforma_id IN (SELECT id FROM e2e_plataforma);
-- Ordens de serviço da Engenharia (PLU-345) com a marca na descrição, e as das
-- usinas do run (as que o monitoramento abriu); o pedido de material de uma delas
-- sai junto, mesmo sem a marca no título.
CREATE TEMP TABLE e2e_os ON COMMIT DROP AS
  SELECT id FROM ordens_de_servico WHERE descricao ~ (SELECT marca FROM e2e_marca) OR usina_id IN (SELECT id FROM e2e_usina);
-- Tarefas dos departamentos (PLU-349) com a marca no título.
CREATE TEMP TABLE e2e_tarefa ON COMMIT DROP AS
  SELECT id FROM tarefas WHERE titulo ~ (SELECT marca FROM e2e_marca);
CREATE TEMP TABLE e2e_ped ON COMMIT DROP AS
  SELECT id FROM pedidos_de_compra WHERE titulo ~ (SELECT marca FROM e2e_marca) OR ordem_de_servico_id IN (SELECT id FROM e2e_os);
CREATE TEMP TABLE e2e_item ON COMMIT DROP AS
  SELECT id FROM itens_de_estoque WHERE nome ~ (SELECT marca FROM e2e_marca);
CREATE TEMP TABLE e2e_forn ON COMMIT DROP AS
  SELECT id FROM fornecedores WHERE nome ~ (SELECT marca FROM e2e_marca);
-- Protocolos na distribuidora (PLU-348) com a marca no número ou na observação,
-- e distribuidoras criadas pelo run.
CREATE TEMP TABLE e2e_protocolo ON COMMIT DROP AS
  SELECT id FROM protocolos WHERE numero ~ (SELECT marca FROM e2e_marca) OR observacao ~ (SELECT marca FROM e2e_marca);
CREATE TEMP TABLE e2e_distribuidora ON COMMIT DROP AS
  SELECT id FROM distribuidoras WHERE nome ~ (SELECT marca FROM e2e_marca);
-- Obras (PLU-350) com a marca no nome.
CREATE TEMP TABLE e2e_obra ON COMMIT DROP AS
  SELECT id FROM obras WHERE nome ~ (SELECT marca FROM e2e_marca);
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
      AND id NOT IN (SELECT id FROM e2e_lanc))
    OR EXISTS (SELECT 1 FROM ordens_de_servico WHERE ordem_anterior_id IN (SELECT id FROM e2e_os) AND id NOT IN (SELECT id FROM e2e_os))
    OR EXISTS (SELECT 1 FROM resultados_da_conferencia WHERE conferencia_id IN (SELECT id FROM e2e_conferencia) AND usina_id NOT IN (SELECT id FROM e2e_usina))
    OR EXISTS (SELECT 1 FROM resultados_da_conferencia WHERE ordem_de_servico_id IN (SELECT id FROM e2e_os) AND conferencia_id NOT IN (SELECT id FROM e2e_conferencia))
    OR EXISTS (SELECT 1 FROM usinas WHERE ordem_de_comissionamento_id IN (SELECT id FROM e2e_os) AND id NOT IN (SELECT id FROM e2e_usina))
    OR EXISTS (SELECT 1 FROM usinas WHERE plataforma_id IN (SELECT id FROM e2e_plataforma) AND id NOT IN (SELECT id FROM e2e_usina))
    OR EXISTS (SELECT 1 FROM protocolos WHERE distribuidora_id IN (SELECT id FROM e2e_distribuidora) AND id NOT IN (SELECT id FROM e2e_protocolo))
    OR EXISTS (SELECT 1 FROM documentos_de_obra WHERE protocolo_id IN (SELECT id FROM e2e_protocolo) AND obra_id NOT IN (SELECT id FROM e2e_obra))
    OR EXISTS (SELECT 1 FROM ordens_de_servico WHERE obra_id IN (SELECT id FROM e2e_obra) AND id NOT IN (SELECT id FROM e2e_os))
    OR EXISTS (SELECT 1 FROM pedidos_de_compra WHERE obra_id IN (SELECT id FROM e2e_obra) AND id NOT IN (SELECT id FROM e2e_ped))
    OR EXISTS (SELECT 1 FROM movimentacoes_de_estoque WHERE obra_id IN (SELECT id FROM e2e_obra) AND item_id NOT IN (SELECT id FROM e2e_item)) THEN
    RAISE EXCEPTION 'um registro fora deste run depende dele: nada foi apagado';
  END IF;
END $dependentes$;

-- As chaves dos arquivos, antes de apagar as linhas.
SELECT 'arquivo' AS tipo, arquivo_chave FROM cotacoes_de_compra WHERE pedido_id IN (SELECT id FROM e2e_ped)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM comprovantes_de_pagamento WHERE pedido_id IN (SELECT id FROM e2e_ped)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM anexos_de_lancamento WHERE lancamento_id IN (SELECT id FROM e2e_lanc)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM arquivos_de_ordens_de_servico WHERE ordem_id IN (SELECT id FROM e2e_os)
UNION ALL
SELECT 'arquivo', print_chave FROM conferencias_de_plataforma WHERE id IN (SELECT id FROM e2e_conferencia)
UNION ALL
SELECT 'arquivo', arquivo_chave FROM documentos_de_obra WHERE obra_id IN (SELECT id FROM e2e_obra)
UNION ALL
SELECT 'arquivo', e.arquivo_chave FROM evidencias_de_tarefa e JOIN ocorrencias_de_tarefa o ON o.id = e.ocorrencia_id WHERE o.tarefa_id IN (SELECT id FROM e2e_tarefa);

-- O que pende do lançamento (PLU-337 e PLU-342) sai antes dele: pedidos ao OMIE,
-- anexos, linha do tempo e UCs.
DELETE FROM omie_envios WHERE lancamento_id IN (SELECT id FROM e2e_lanc);
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
-- O monitoramento do run: resultados, conferências e os vínculos usina↔O.S.
DELETE FROM resultados_da_conferencia WHERE conferencia_id IN (SELECT id FROM e2e_conferencia);
DELETE FROM conferencias_de_plataforma WHERE id IN (SELECT id FROM e2e_conferencia);
UPDATE ordens_de_servico SET usina_id = NULL WHERE id IN (SELECT id FROM e2e_os) AND usina_id IS NOT NULL;
-- A usina sai antes da O.S. de comissionamento dela.
DELETE FROM usinas WHERE id IN (SELECT id FROM e2e_usina);
-- A O.S. sai depois dos pedidos de material: termo (aponta para os arquivos),
-- arquivos, linha do tempo e a O.S. Os gatilhos da O.S. são só de UPDATE.
DELETE FROM termos_de_ordens_de_servico WHERE ordem_id IN (SELECT id FROM e2e_os);
DELETE FROM arquivos_de_ordens_de_servico WHERE ordem_id IN (SELECT id FROM e2e_os);
DELETE FROM historico_de_ordens_de_servico WHERE ordem_id IN (SELECT id FROM e2e_os);
DELETE FROM ordens_de_servico WHERE id IN (SELECT id FROM e2e_os);
DELETE FROM plataformas_de_inversor WHERE id IN (SELECT id FROM e2e_plataforma);
-- A tarefa sai com as ocorrências e as evidências (instruções, conclusão e
-- encerramento são colunas delas). Os gatilhos das tarefas são só de UPDATE.
DELETE FROM evidencias_de_tarefa WHERE ocorrencia_id IN (SELECT id FROM ocorrencias_de_tarefa WHERE tarefa_id IN (SELECT id FROM e2e_tarefa));
DELETE FROM ocorrencias_de_tarefa WHERE tarefa_id IN (SELECT id FROM e2e_tarefa);
DELETE FROM tarefas WHERE id IN (SELECT id FROM e2e_tarefa);
-- A obra sai depois das O.S., dos pedidos e das saídas de estoque do run, com os
-- marcos e os documentos (os gatilhos da obra são só de INSERT e UPDATE).
DELETE FROM documentos_de_obra WHERE obra_id IN (SELECT id FROM e2e_obra);
DELETE FROM marcos_de_obra WHERE obra_id IN (SELECT id FROM e2e_obra);
DELETE FROM obras WHERE id IN (SELECT id FROM e2e_obra);
-- O protocolo sai com as verificações (só por inserção, sem gatilho de DELETE).
DELETE FROM verificacoes_de_protocolo WHERE protocolo_id IN (SELECT id FROM e2e_protocolo);
DELETE FROM protocolos WHERE id IN (SELECT id FROM e2e_protocolo);
DELETE FROM distribuidoras WHERE id IN (SELECT id FROM e2e_distribuidora);
DELETE FROM itens_de_estoque WHERE id IN (SELECT id FROM e2e_item);
DELETE FROM fornecedores WHERE id IN (SELECT id FROM e2e_forn);

ALTER TABLE movimentacoes_de_estoque ENABLE TRIGGER movimentacoes_de_estoque_append_only;
ALTER TABLE comprovantes_de_pagamento ENABLE TRIGGER comprovantes_de_pagamento_so_substitui;
ALTER TABLE anexos_de_lancamento ENABLE TRIGGER anexos_de_lancamento_so_substitui;
ALTER TABLE historico_de_lancamento ENABLE TRIGGER historico_de_lancamento_append_only;
ALTER TABLE omie_envios ENABLE TRIGGER omie_envios_coerente;
ALTER TABLE ordens_de_servico ENABLE TRIGGER ordens_de_servico_encerrada_nao_muda;

SELECT (SELECT count(*) FROM e2e_lanc) AS lancamentos, (SELECT count(*) FROM e2e_ped) AS pedidos, (SELECT count(*) FROM e2e_os) AS ordens_de_servico, (SELECT count(*) FROM e2e_tarefa) AS tarefas, (SELECT count(*) FROM e2e_usina) AS usinas, (SELECT count(*) FROM e2e_protocolo) AS protocolos, (SELECT count(*) FROM e2e_obra) AS obras,
       (SELECT count(*) FROM e2e_item) AS itens_de_estoque, (SELECT count(*) FROM e2e_forn) AS fornecedores;
