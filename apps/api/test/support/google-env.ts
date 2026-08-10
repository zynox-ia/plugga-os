/**
 * Liga o login Google ANTES de `app.module.ts` ser importado.
 *
 * `ConfigModule.forRoot({ validate })` é avaliado no momento em que o módulo é
 * IMPORTADO — não quando o `Test.createTestingModule` compila. O ambiente
 * validado fica congelado ali, e o `ConfigService` devolve esse valor congelado,
 * não o `process.env` do instante da requisição. Mexer na variável dentro de um
 * `beforeAll` chega tarde: a flag já foi lida como `false`.
 *
 * Por isso este arquivo existe como import de efeito colateral, sempre a
 * PRIMEIRA linha de import do spec. E por isso o cenário "flag desligada" vive
 * em outro arquivo — cada spec do vitest tem o seu próprio registro de módulos,
 * então "ligado" e "desligado" não cabem no mesmo processo.
 */
process.env.GOOGLE_AUTH_ENABLED = "true";
process.env.GOOGLE_OIDC_CLIENT_ID = "test-only.apps.googleusercontent.com";
// Exigida junto com a flag: o schema recusa o boot com a configuração pela
// metade, e este arquivo é uma configuração ligada como outra qualquer.
process.env.GOOGLE_LOGIN_URI = "http://localhost:3000/api/auth/google/callback";
