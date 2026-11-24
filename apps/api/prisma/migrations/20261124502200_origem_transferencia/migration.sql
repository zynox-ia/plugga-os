-- Conciliação (PLU-339), fatia C6: a origem das duas pernas de uma transferência entre contas
-- da mesma empresa (a saída numa conta, a entrada na outra). As regras vêm na migration
-- seguinte: o valor novo de um enum só pode ser usado depois do COMMIT que o cria.
BEGIN;

ALTER TYPE public.financeiro_origem ADD VALUE 'transferencia';

COMMIT;
