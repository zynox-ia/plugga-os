-- PLU-339 (revisão de 27/11/2026): a origem do lançamento só como a aplicação a grava.
-- A 20261127150339 preencheu a origem pelo par atual e a 20261127161339 tentou separar o certo
-- pelo instante da conciliação. Nenhuma das duas prova a linha de que o lançamento nasceu: o par
-- pode ter mudado depois de um desfazer, e uma conciliação à parte pode cair no mesmo instante do
-- pagamento.
--
-- Não há o que inferir. Criar o lançamento a partir de uma linha do extrato (a tarifa, a criação
-- guiada e a transferência) só existe a partir desta mesma leva: fora da máquina de quem a escreveu,
-- nenhum lançamento antigo nasceu de uma linha, e a origem certa de tudo o que existia antes da
-- coluna é nula. Esta migration zera a origem de todo lançamento criado antes de a 20261127150339
-- começar (`started_at` dela); o que a aplicação gravou depois fica. Num banco novo, em que as três
-- sobem juntas, isso limpa tudo, que é o certo. Sem o registro da 20261127150339, limpa tudo.
--
-- Por que o início e não o fim dela: a coluna nasce num ALTER TABLE que espera e segura o lock
-- exclusivo da tabela até o COMMIT; quem criou um lançamento durante a migration só gravou depois,
-- já com a aplicação nova.

BEGIN;

-- A origem gravada não muda (gatilho lancamentos_imutaveis): desligado só para o UPDATE abaixo,
-- nesta transação, e religado antes do COMMIT. Um erro desfaz tudo, o gatilho inclusive.
ALTER TABLE public.lancamentos DISABLE TRIGGER lancamentos_imutaveis;

UPDATE public.lancamentos SET movimento_de_origem_id = NULL
  WHERE movimento_de_origem_id IS NOT NULL
    AND created_at < COALESCE(
      (SELECT min(started_at) FROM public._prisma_migrations
        WHERE migration_name = '20261127150339_lancamento_da_linha_do_extrato' AND rolled_back_at IS NULL),
      'infinity'::timestamptz);

ALTER TABLE public.lancamentos ENABLE TRIGGER lancamentos_imutaveis;

COMMIT;
