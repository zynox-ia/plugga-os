-- Comprovantes de pagamento preservados (PLU-327, decisão do coordenador em
-- 23/11/2026): trocar o comprovante não apaga o anterior. Cada envio vira uma
-- linha; o atual é o que não foi substituído, e o substituído guarda quem o
-- trocou e quando. Apagar evidência de pagamento não é operação do sistema:
-- não há política de DELETE e o arquivo fica no armazenamento.
--
-- Os comprovantes que já existem nas colunas do pedido migram para a tabela.

BEGIN;

CREATE TABLE public.comprovantes_de_pagamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  arquivo_chave text NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_tamanho integer NOT NULL,
  arquivo_tipo text NOT NULL,
  enviado_por_id uuid,
  enviado_em timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  substituido_em timestamptz(6),
  substituido_por_id uuid,
  CONSTRAINT comprovantes_de_pagamento_pkey PRIMARY KEY (id),
  CONSTRAINT comprovantes_de_pagamento_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_de_compra(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT comprovantes_de_pagamento_enviado_por_id_fkey FOREIGN KEY (enviado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT comprovantes_de_pagamento_substituido_por_id_fkey FOREIGN KEY (substituido_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT comprovantes_de_pagamento_substituicao_coerente CHECK (substituido_em IS NOT NULL OR substituido_por_id IS NULL)
);
CREATE INDEX comprovantes_de_pagamento_pedido_id_enviado_em_idx ON public.comprovantes_de_pagamento (pedido_id, enviado_em);
-- Um comprovante atual por pedido.
CREATE UNIQUE INDEX comprovantes_de_pagamento_um_atual_por_pedido ON public.comprovantes_de_pagamento (pedido_id) WHERE substituido_em IS NULL;

INSERT INTO public.comprovantes_de_pagamento (pedido_id, arquivo_chave, arquivo_nome, arquivo_tamanho, arquivo_tipo, enviado_em)
SELECT id, comprovante_chave, comprovante_nome, coalesce(comprovante_tamanho, 0), coalesce(comprovante_tipo, 'application/octet-stream'), updated_at
FROM public.pedidos_de_compra WHERE comprovante_chave IS NOT NULL AND comprovante_nome IS NOT NULL;

ALTER TABLE public.pedidos_de_compra
  DROP COLUMN comprovante_chave,
  DROP COLUMN comprovante_nome,
  DROP COLUMN comprovante_tamanho,
  DROP COLUMN comprovante_tipo;

-- Mesmo regime das demais tabelas (20261106010000_isolamento_rls): RLS forçado,
-- nada para PUBLIC, leitura do dono só para as funções de segurança.
ALTER TABLE public.comprovantes_de_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprovantes_de_pagamento FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.comprovantes_de_pagamento FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
DO $dono$ BEGIN
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.comprovantes_de_pagamento FOR SELECT TO %I USING (true)', current_user);
END $dono$;
GRANT SELECT, INSERT, UPDATE ON public.comprovantes_de_pagamento TO plugga_runtime;

-- Lê quem lê Compras; envia e substitui quem paga (Financeiro).
CREATE POLICY rls_ler ON public.comprovantes_de_pagamento FOR SELECT TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_inserir ON public.comprovantes_de_pagamento FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_atualizar ON public.comprovantes_de_pagamento FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));

-- O UPDATE só marca a substituição, uma vez: arquivo, pedido e envio não mudam,
-- e um comprovante substituído não volta a ser o atual.
CREATE FUNCTION plugga_security.comprovante_so_substitui() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF OLD.substituido_em IS NOT NULL
    OR NEW.substituido_em IS NULL
    OR (NEW.pedido_id, NEW.arquivo_chave, NEW.arquivo_nome, NEW.arquivo_tamanho, NEW.arquivo_tipo, NEW.enviado_por_id, NEW.enviado_em)
       IS DISTINCT FROM (OLD.pedido_id, OLD.arquivo_chave, OLD.arquivo_nome, OLD.arquivo_tamanho, OLD.arquivo_tipo, OLD.enviado_por_id, OLD.enviado_em)
  THEN
    RAISE EXCEPTION 'comprovante de pagamento só pode ser marcado como substituído, uma vez';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.comprovante_so_substitui() FROM PUBLIC;
CREATE TRIGGER comprovantes_de_pagamento_so_substitui BEFORE UPDATE ON public.comprovantes_de_pagamento
  FOR EACH ROW EXECUTE FUNCTION plugga_security.comprovante_so_substitui();

COMMIT;
