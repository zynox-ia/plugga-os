-- Evidência de compra não se apaga em cascata (PLU-327, decisão do coordenador
-- em 23/11/2026, a partir da revisão do 18750ea).
--
--   * Apagar um pedido que tem cotação ou comprovante é recusado pelo banco, em
--     vez de levar o orçamento e o comprovante de pagamento junto.
--   * Apagar um usuário que enviou ou substituiu um comprovante é recusado com a
--     mensagem do próprio FK. Com SET NULL, a exclusão disparava a trigger
--     `comprovante_so_substitui` e falhava com uma mensagem que não dizia o motivo.
--     O sistema não apaga usuários (só desativa); isto deixa a intenção explícita.

BEGIN;

ALTER TABLE public.cotacoes_de_compra
  DROP CONSTRAINT cotacoes_de_compra_pedido_id_fkey,
  ADD CONSTRAINT cotacoes_de_compra_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_de_compra(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.comprovantes_de_pagamento
  DROP CONSTRAINT comprovantes_de_pagamento_pedido_id_fkey,
  DROP CONSTRAINT comprovantes_de_pagamento_enviado_por_id_fkey,
  DROP CONSTRAINT comprovantes_de_pagamento_substituido_por_id_fkey,
  ADD CONSTRAINT comprovantes_de_pagamento_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_de_compra(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT comprovantes_de_pagamento_enviado_por_id_fkey FOREIGN KEY (enviado_por_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT comprovantes_de_pagamento_substituido_por_id_fkey FOREIGN KEY (substituido_por_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
