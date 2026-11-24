-- PLU-355: o Compras não cria obra; o pedido escolhe uma obra do cadastro de
-- Obras da Engenharia (PLU-350), um cadastro só para o centro de custo. A
-- leitura das obras pelas telas do Compras e do Estoque continua (rls_ler), e as
-- obras já criadas pelo Compras seguem válidas na tela de Obras.

DROP POLICY rls_inserir ON public.obras;
