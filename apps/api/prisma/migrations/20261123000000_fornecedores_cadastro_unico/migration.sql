-- Cadastro de fornecedores de Suprimentos (PLU-326).
--
-- Decisão do André em 23/11/2026: o fornecedor é um cadastro único,
-- compartilhado por Plugga e Waze. Esta migração:
--   1. interrompe se dois fornecedores tiverem o mesmo documento (unificá-los
--      é decisão humana, não da migração);
--   2. tira a empresa do fornecedor e torna o documento único no cadastro;
--   3. acrescenta os campos do cadastro e quem criou e alterou;
--   4. troca a política "só plataforma" por leitura e escrita pela tela:
--      lê quem tem Fornecedores, Compras ou uma tela do Financeiro (que vê as
--      cotações); escreve só quem tem Fornecedores. Não há política de DELETE:
--      fornecedor sai de uso por inativação.

BEGIN;

DO $preflight$
DECLARE repetidos bigint;
BEGIN
  SELECT count(*) INTO repetidos FROM (
    SELECT documento FROM public.fornecedores WHERE documento IS NOT NULL GROUP BY documento HAVING count(*) > 1
  ) d;
  IF repetidos > 0 THEN
    RAISE EXCEPTION 'Preflight: % documentos repetidos entre fornecedores; requer saneamento humano antes do cadastro único', repetidos;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fornecedores WHERE documento IS NOT NULL AND documento !~ '^([0-9]{11}|[0-9]{14})$') THEN
    RAISE EXCEPTION 'Preflight: fornecedor com documento fora do formato CPF/CNPJ só com dígitos; requer saneamento humano';
  END IF;
END $preflight$;

-- 2. Empresa sai; documento único no cadastro todo (vários nulos são aceitos).
ALTER TABLE public.fornecedores DROP CONSTRAINT fornecedores_company_id_fkey;
DROP INDEX public.fornecedores_company_id_documento_key;
DROP INDEX public.fornecedores_company_id_ativo_idx;
ALTER TABLE public.fornecedores DROP COLUMN company_id;
CREATE UNIQUE INDEX fornecedores_documento_key ON public.fornecedores (documento);
CREATE INDEX fornecedores_ativo_nome_idx ON public.fornecedores (ativo, nome);
ALTER TABLE public.fornecedores
  ADD CONSTRAINT fornecedores_documento_formato CHECK (documento IS NULL OR documento ~ '^([0-9]{11}|[0-9]{14})$');

-- 3. Campos do cadastro.
CREATE TYPE public.fornecedor_categoria AS ENUM ('kit_solar', 'material_eletrico', 'material_de_obra', 'servico', 'escritorio', 'outros');
CREATE TYPE public.forma_de_pagamento AS ENUM ('pix', 'boleto', 'cartao_credito', 'transferencia');

ALTER TABLE public.fornecedores
  ADD COLUMN nome_fantasia text,
  -- Os fornecedores que já existem entram como "outros"; o padrão sai em seguida
  -- porque a categoria é escolha obrigatória de quem cadastra.
  ADD COLUMN categoria public.fornecedor_categoria NOT NULL DEFAULT 'outros',
  ADD COLUMN contato_nome text,
  ADD COLUMN telefone text,
  ADD COLUMN email text,
  ADD COLUMN cidade text,
  ADD COLUMN uf text,
  ADD COLUMN formas_de_pagamento public.forma_de_pagamento[] NOT NULL DEFAULT ARRAY[]::public.forma_de_pagamento[],
  ADD COLUMN chave_pix text,
  ADD COLUMN dados_bancarios text,
  ADD COLUMN observacoes text,
  ADD COLUMN criado_por_id uuid,
  ADD COLUMN atualizado_por_id uuid;
ALTER TABLE public.fornecedores ALTER COLUMN categoria DROP DEFAULT;
ALTER TABLE public.fornecedores
  ADD CONSTRAINT fornecedores_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fornecedores_atualizado_por_id_fkey FOREIGN KEY (atualizado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Acesso pela tela, no lugar do "só plataforma".
DROP POLICY rls_plataforma ON public.fornecedores;
CREATE POLICY rls_ler ON public.fornecedores FOR SELECT TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores', 'suprimentos.compras',
    'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']));
CREATE POLICY rls_inserir ON public.fornecedores FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores']));
CREATE POLICY rls_atualizar ON public.fornecedores FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores']));

COMMIT;
