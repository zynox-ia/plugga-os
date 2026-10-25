import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  acessoADepartamentoSchema,
  papelDePlataformaSchema,
  roleKeySchema,
  type Acesso,
  type RoleKey,
} from "@plugga/shared";

import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "./auth.types";

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

    const roles = this.parseRoles(this.firstHeader(request.headers["x-dev-roles"]));

    return {
      id,
      kind: id.startsWith("service:") ? "service" : "user",
      roles,
      acesso: this.parseAcesso(request, roles),
    };
  }

  private parseRoles(header: string | undefined): RoleKey[] {
    if (!header) {
      return [];
    }

    return header
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .flatMap((role) => {
        const parsed = roleKeySchema.safeParse(role);
        return parsed.success ? [parsed.data] : [];
      });
  }

  /**
   * Acesso de 4 papéis: `x-dev-plataforma: admin|desenvolvedor` e
   * `x-dev-departamentos: crm:membro,suprimentos:gerente`. Sem o primeiro,
   * `x-dev-roles: admin` vale como admin, como a linha `admin` vale no banco.
   * Valor desconhecido é ignorado, nunca promovido.
   */
  private parseAcesso(request: AuthenticatedRequest, roles: RoleKey[]): Acesso {
    const plataformaHeader = this.firstHeader(request.headers["x-dev-plataforma"])?.toLowerCase();
    const plataforma = papelDePlataformaSchema.safeParse(plataformaHeader);
    if (plataforma.success) {
      return { plataforma: plataforma.data, departamentos: [] };
    }
    if (roles.includes("admin")) {
      return { plataforma: "admin", departamentos: [] };
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
