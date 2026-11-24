-- A agenda do Google de cada pessoa. Uma linha por usuário, com o token de
-- renovação cifrado (AES-256-GCM, chave-mestra só no ambiente da API) e a conta
-- Google conectada, para a tela dizer "conectado como ...".
--
-- Ninguém além do dono alcança a linha: nem admin, nem desenvolvedor, nem gerente.
-- A política compara com o usuário da sessão e nada mais; não há caminho de
-- plataforma. Só o pool da aplicação enxerga a tabela (autenticação e jobs, não).
BEGIN;

CREATE TABLE "public"."conexoes_google_calendar" (
    "user_id" UUID NOT NULL,
    "google_email" TEXT NOT NULL,
    "escopos" TEXT NOT NULL,
    "refresh_token_cifrado" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "conectado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conexoes_google_calendar_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "public"."conexoes_google_calendar"
  ADD CONSTRAINT "conexoes_google_calendar_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.conexoes_google_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conexoes_google_calendar FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.conexoes_google_calendar FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conexoes_google_calendar TO plugga_runtime;

-- `(SELECT ...)` avalia o usuário uma vez por consulta, não por linha.
CREATE POLICY rls_propria ON public.conexoes_google_calendar FOR ALL TO plugga_runtime
  USING (user_id = (SELECT plugga_security.usuario_id()))
  WITH CHECK (user_id = (SELECT plugga_security.usuario_id()));

COMMIT;
