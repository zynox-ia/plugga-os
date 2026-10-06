/**
 * Ajusta o atraso progressivo do login ANTES de `app.module.ts` ser importado.
 *
 * Pelo mesmo motivo de `google-env.ts`: o `ConfigModule` congela o ambiente
 * validado quando o módulo é importado, então isto tem de ser um import de
 * efeito colateral, sempre o PRIMEIRO do spec. Atrasos pequenos mas medíveis:
 * a falha livre não espera nada; depois, 20 ms dobrando até 60 ms.
 */
process.env.LOGIN_FREE_ATTEMPTS_ACCOUNT = "5";
process.env.LOGIN_FREE_ATTEMPTS_ORIGIN = "15";
process.env.LOGIN_DELAY_BASE_MS = "20";
process.env.LOGIN_DELAY_MAX_MS = "60";
