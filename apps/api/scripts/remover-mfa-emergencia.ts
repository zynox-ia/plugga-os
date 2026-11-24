import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ConfigService } from "@nestjs/config";
import { AuditAppender } from "../src/audit/audit-appender";
import { MfaService } from "../src/auth/mfa.service";
import { PrismaMfaRepository } from "../src/auth/prisma-mfa.repository";
import { parseEmergencyMfaArgs } from "../src/auth/mfa-emergency-options";
import { validateEnvironment } from "../src/config/environment";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { PrismaAuthService } from "../src/prisma/prisma-auth.service";

async function main(): Promise<void> {
  const { userId, reason, authorization } = parseEmergencyMfaArgs(process.argv.slice(2));
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
  const config = new ConfigService(validateEnvironment(process.env));
  const prisma = new PrismaAuthService();
  try {
    await prisma.onModuleInit();
    const service = new MfaService(new PrismaMfaRepository(prisma, new AuditAppender()), config, new NullSessionCache());
    await service.emergencyRemove(userId, reason, authorization);
    process.stdout.write("Segundo fator removido; sessões e desafios revogados; operação auditada.\n");
  } finally { await prisma.$disconnect(); }
}
main().catch(() => {
  // Prisma errors may include query parameters. Never print credentials, arguments, or traces.
  process.stderr.write("Remoção não concluída. Confira os parâmetros, autorização do André e a conexão do pool de autenticação.\n");
  process.exitCode = 1;
});
