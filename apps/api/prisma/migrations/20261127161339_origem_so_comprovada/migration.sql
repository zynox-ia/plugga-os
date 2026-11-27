-- PLU-339 (revisão de 27/11/2026): a linha de origem do lançamento só com prova.
-- A 20261127150339 preencheu a origem com o par ATUAL. Um lançamento que nasceu da linha A,
-- teve o par desfeito e foi conciliado com B ficou com B para sempre: A livre para duplicar e B
-- presa depois de desfazer o novo par. Esta migration desfaz o que não tem prova e preenche só o
-- comprovado.
--
-- A prova: a criação guiada, a tarifa e a transferência pelo extrato conciliam na mesma chamada
-- em que nascem, com o mesmo instante em `conciliado_em` e no registro do pagamento (ou do
-- recebimento); uma conciliação posterior tem outro instante. E o par nunca foi desfeito (o
-- desfazer fica no histórico). Com as duas, o par atual é a linha de que o lançamento nasceu.
-- Sem prova, a origem fica nula (a linha volta a aceitar uma criação; é o incerto).
--
-- Limite conhecido: o que nasceu entre as duas migrations, conciliado com a própria linha e com o
-- par desfeito e refeito, perde a origem (indistinguível do preenchimento sem prova). Na produção
-- as duas sobem juntas; nos bancos locais não há caso assim.

BEGIN;

-- A origem gravada não muda (gatilho lancamentos_imutaveis): desligado só para os dois UPDATE
-- abaixo, nesta transação, e religado antes do COMMIT.
ALTER TABLE public.lancamentos DISABLE TRIGGER lancamentos_imutaveis;

-- 1. O preenchido pelo par atual (a marca da migration anterior) e sem prova: nulo.
UPDATE public.lancamentos l SET movimento_de_origem_id = NULL
  WHERE l.movimento_de_origem_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.movimentos_do_extrato m WHERE m.id = l.movimento_de_origem_id AND m.lancamento_id = l.id)
    AND NOT (
      l.origem IN ('conciliacao', 'tarifa_bancaria', 'transferencia') AND l.cancelado_em IS NULL
      AND l.conciliado_em IS NOT NULL AND l.conciliado_em = COALESCE(l.pagamento_registrado_em, l.recebimento_registrado_em)
      AND NOT EXISTS (SELECT 1 FROM public.historico_de_lancamento h WHERE h.lancamento_id = l.id AND h.tipo = 'conciliado' AND h.dados->>'acao' = 'desfeito')
    );

-- 2. O comprovado que ainda está nulo, inclusive a perna da transferência feita pelo extrato.
UPDATE public.lancamentos l SET movimento_de_origem_id = m.id
  FROM public.movimentos_do_extrato m
  WHERE m.lancamento_id = l.id AND l.movimento_de_origem_id IS NULL
    AND l.origem IN ('conciliacao', 'tarifa_bancaria', 'transferencia') AND l.cancelado_em IS NULL
    AND l.conciliado_em IS NOT NULL AND l.conciliado_em = COALESCE(l.pagamento_registrado_em, l.recebimento_registrado_em)
    AND NOT EXISTS (SELECT 1 FROM public.historico_de_lancamento h WHERE h.lancamento_id = l.id AND h.tipo = 'conciliado' AND h.dados->>'acao' = 'desfeito');

ALTER TABLE public.lancamentos ENABLE TRIGGER lancamentos_imutaveis;

COMMIT;
