import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { acessoADepartamentoSchema, papelDePlataformaSchema, type Acesso } from "@plugga/shared";

import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "./auth.types";

/**
 * Autenticação por cabeçalho, só com `DEV_AUTH_ENABLED` (desenvolvimento e
 * testes): `x-dev-principal` é o id; o acesso vem de
 * `x-dev-plataforma: admin|desenvolvedor` ou de
 * `x-dev-departamentos: crm:membro,suprimentos:gerente`. Valor desconhecido é
 * ignorado, nunca promovido.
 */
@Injectable()
export class DevHeaderAuthContext extends AuthContext {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    super();
  }

  async resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null> {
    if (!this.config.get<boolean>("DEV_AUTH_ENABLED", false)) {
      return null;
    }

    const id = this.firstHeader(request.headers["x-dev-principal"]);
    if (!id) {
      return null;
    }

    return {
      id,
      kind: id.startsWith("service:") ? "service" : "user",
      acesso: this.parseAcesso(request),
    };
  }

  private parseAcesso(request: AuthenticatedRequest): Acesso {
    const plataforma = papelDePlataformaSchema.safeParse(
      this.firstHeader(request.headers["x-dev-plataforma"])?.toLowerCase(),
    );
    if (plataforma.success) {
      return { plataforma: plataforma.data, departamentos: [] };
    }

    const vistos = new Set<string>();
    const departamentos = (this.firstHeader(request.headers["x-dev-departamentos"]) ?? "")
      .split(",")
      .flatMap((entrada) => {
        const [departamento, nivel] = entrada.trim().toLowerCase().split(":");
        const parsed = acessoADepartamentoSchema.safeParse({ departamento, nivel: nivel ?? "membro" });
        if (!parsed.success || vistos.has(parsed.data.departamento)) {
          return [];
        }
        vistos.add(parsed.data.departamento);
        return [parsed.data];
      });
    return { plataforma: null, departamentos };
  }

  private firstHeader(header: string | string[] | undefined): string | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
