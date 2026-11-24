-- Uma usina por O.S. de comissionamento (PLU-347): a segunda usina da mesma O.S.
-- é recusada. Índice parcial (o Prisma não o descreve no schema), como os de
-- comprovantes e reservas.

CREATE UNIQUE INDEX usinas_uma_por_comissionamento ON public.usinas (ordem_de_comissionamento_id)
  WHERE ordem_de_comissionamento_id IS NOT NULL;
