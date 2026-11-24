-- O mesmo CNPJ não fica confirmado nas duas empresas (PLU-342, revisão do 753e6c6):
-- um lançamento da Waze nunca vai para o OMIE da Plugga. A aplicação já bloqueia
-- com as duas conferências travadas; o índice é a última barreira.
CREATE UNIQUE INDEX omie_conexoes_cnpj_confirmado_key ON public.omie_conexoes (cnpj_confirmado) WHERE confirmada_em IS NOT NULL;
