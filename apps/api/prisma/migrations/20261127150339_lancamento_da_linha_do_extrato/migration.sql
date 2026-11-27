-- PLU-339 (revisão de 27/11/2026): a linha do extrato de que o lançamento nasceu na Conciliação.
-- Criada "sem conciliar" (outro valor), a linha fica pendente e sem par: sem este vínculo, o
-- reenvio criaria uma segunda despesa paga. Com ele, a criação guiada, a tarifa e a perna da
-- transferência guardam a linha, e o banco aceita um só lançamento vivo por linha de origem.

ALTER TABLE public.lancamentos ADD COLUMN movimento_de_origem_id uuid;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_movimento_de_origem_id_fkey
  FOREIGN KEY (movimento_de_origem_id) REFERENCES public.movimentos_do_extrato(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Um vivo por linha. O cancelado sai do índice (o liquidado não se cancela hoje, mas a regra
-- não depende disso).
CREATE UNIQUE INDEX lancamentos_um_por_movimento_de_origem ON public.lancamentos (movimento_de_origem_id)
  WHERE movimento_de_origem_id IS NOT NULL AND cancelado_em IS NULL;

-- O que já nasceu na Conciliação e está conciliado: a linha do par é a de origem. A transferência
-- fica de fora (a perna também nasce na tela de Lançamentos, e lá não há linha de origem).
UPDATE public.lancamentos l SET movimento_de_origem_id = m.id
  FROM public.movimentos_do_extrato m
  WHERE m.lancamento_id = l.id AND l.origem IN ('conciliacao', 'tarifa_bancaria') AND l.movimento_de_origem_id IS NULL;

-- O que não muda: o de sempre, a transferência da perna, na perna conta, valor, dias e o
-- cancelamento, e agora a linha de origem depois de gravada.
CREATE OR REPLACE FUNCTION public.lancamentos_imutaveis() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.tipo <> OLD.tipo OR NEW.numero <> OLD.numero OR NEW.company_id <> OLD.company_id
    OR NEW.origem <> OLD.origem OR NEW.pedido_de_compra_id IS DISTINCT FROM OLD.pedido_de_compra_id
    OR NEW.transferencia_id IS DISTINCT FROM OLD.transferencia_id THEN
    RAISE EXCEPTION 'tipo, número, empresa e origem do lançamento não mudam' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.origem = 'transferencia' AND (NEW.valor <> OLD.valor OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido
    OR NEW.conta_corrente_id IS DISTINCT FROM OLD.conta_corrente_id OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
    OR NEW.recebido_em IS DISTINCT FROM OLD.recebido_em OR NEW.vencimento <> OLD.vencimento OR NEW.cancelado_em IS DISTINCT FROM OLD.cancelado_em) THEN
    RAISE EXCEPTION 'a perna de uma transferência não muda: conta, valor e dia são os da transferência' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.movimento_de_origem_id IS NOT NULL AND NEW.movimento_de_origem_id IS DISTINCT FROM OLD.movimento_de_origem_id THEN
    RAISE EXCEPTION 'a linha do extrato de origem do lançamento não muda' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;
