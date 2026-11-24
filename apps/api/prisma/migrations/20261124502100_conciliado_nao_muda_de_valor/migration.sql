-- Conciliação (PLU-339), C5c: o lançamento conciliado não muda de valor.
--
-- A correção do valor do pago ou recebido vale só antes de conciliar (a aplicação recusa
-- depois). Como a tela Conciliação tem UPDATE em `lancamentos` desde a C3, a regra também
-- fica no banco, como as outras de dinheiro. Desfazer a conciliação passa a etapa para paga
-- ou recebida sem mexer no valor, então não é afetado; a correção vem depois, noutro UPDATE.
BEGIN;

CREATE FUNCTION public.lancamentos_conciliado_sem_mudar_valor() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF OLD.etapa = 'conciliada' AND (NEW.valor IS DISTINCT FROM OLD.valor OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido) THEN
    RAISE EXCEPTION 'o valor do lançamento conciliado não muda: desfaça a conciliação primeiro' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER lancamentos_conciliado_sem_mudar_valor BEFORE UPDATE OF valor, valor_recebido ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.lancamentos_conciliado_sem_mudar_valor();

COMMIT;
