-- O agendador das Tarefas (PLU-349, PLU-340): todo dia às 08:00 de Manaus, o
-- papel de jobs gera as ocorrências de todos os departamentos até o fim da
-- semana, como o robô do Bitrix fazia. Ele só lê as tarefas, avança a marca da
-- geração e insere ocorrências abertas: não conclui, não encerra, não apaga e
-- não lê as evidências.

BEGIN;

GRANT SELECT ON public.tarefas TO plugga_jobs_runtime;
GRANT UPDATE (gerada_ate, updated_at) ON public.tarefas TO plugga_jobs_runtime;
GRANT SELECT, INSERT ON public.ocorrencias_de_tarefa TO plugga_jobs_runtime;

CREATE POLICY rls_jobs_ler ON public.tarefas FOR SELECT TO plugga_jobs_runtime USING (true);
CREATE POLICY rls_jobs_gerar ON public.tarefas FOR UPDATE TO plugga_jobs_runtime
  USING (encerrada_em IS NULL) WITH CHECK (encerrada_em IS NULL);
CREATE POLICY rls_jobs_ler ON public.ocorrencias_de_tarefa FOR SELECT TO plugga_jobs_runtime USING (true);
CREATE POLICY rls_jobs_gerar ON public.ocorrencias_de_tarefa FOR INSERT TO plugga_jobs_runtime
  WITH CHECK (concluida_em IS NULL AND concluida_por_id IS NULL AND cancelada_em IS NULL AND NOT automatica AND resultado IS NULL);

COMMIT;
