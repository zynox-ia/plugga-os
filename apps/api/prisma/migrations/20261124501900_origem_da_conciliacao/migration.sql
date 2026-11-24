-- Conciliação (PLU-339), fatia C5: as origens do lançamento que nasce na Conciliação.
-- - `tarifa_bancaria`: o "Criar tarifa" de uma linha de débito do extrato.
-- - `conciliacao`: a despesa ou a receita criada a partir de uma linha sem par.
-- Os dois nascem pagos (ou recebidos). A saída deles não passa pela aprovação F2, e a
-- origem é a marca consultável disso (`pagoSemAprovacao`). As regras vêm na migration
-- seguinte: o valor novo de um enum só pode ser usado depois do COMMIT que o cria.
BEGIN;

ALTER TYPE public.financeiro_origem ADD VALUE 'tarifa_bancaria';
ALTER TYPE public.financeiro_origem ADD VALUE 'conciliacao';

COMMIT;
