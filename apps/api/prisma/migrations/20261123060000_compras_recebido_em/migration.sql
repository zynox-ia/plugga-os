-- Dia do recebimento informado por quem recebeu (PLU-327): "Recebido em", além
-- do momento em que o recebimento foi registrado (concluido_em). Guardado como o
-- início do dia em Manaus, como as outras datas de calendário.

BEGIN;

ALTER TABLE public.pedidos_de_compra ADD COLUMN recebido_em timestamptz(6);

COMMIT;
