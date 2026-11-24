-- Conciliação (PLU-339), fatia C5: a categoria de tarifas bancárias da empresa.
--
-- O "Criar tarifa" da Conciliação lança a tarifa nesta categoria. É um marcador da própria
-- categoria (não há tela de Preferências), uma por empresa, só de despesa. A gerência marca
-- na aba Categorias; marcar outra desmarca a anterior na mesma transação (a aplicação faz
-- a troca e o índice único garante). Categoria inativa não fica marcada.
BEGIN;

ALTER TABLE public.categorias_financeiras
  ADD COLUMN tarifa_bancaria boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT categorias_financeiras_tarifa_de_despesa CHECK (NOT tarifa_bancaria OR (tipo = 'despesa' AND ativa));
CREATE UNIQUE INDEX categorias_financeiras_tarifa_bancaria_key ON public.categorias_financeiras (company_id) WHERE tarifa_bancaria;

-- Só a gerência grava (as políticas de INSERT e UPDATE de 20261124500600 continuam).
GRANT INSERT (tarifa_bancaria), UPDATE (tarifa_bancaria) ON public.categorias_financeiras TO plugga_runtime;

COMMIT;
