import { Inject, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { departamentoComTarefasSchema } from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { PORTAO_DO_DEPARTAMENTO } from "./tarefas.rules";

/**
 * Portão das Tarefas pelo departamento da rota, antes da sessão, como os
 * portões do Financeiro e da Engenharia: o departamento com o portão fechado
 * responde 404. Um departamento que não tem Tarefas é identificador inválido (400),
 * como todo parâmetro de rota fora do formato.
 */
@Injectable()
export class PortaoDoDepartamentoGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const { params } = context.switchToHttp().getRequest<{ params?: Record<string, string> }>();
    const departamento = departamentoComTarefasSchema.safeParse(params?.departamento);
    if (!departamento.success) throw new RequisicaoInvalida("Departamento inválido.", [{ campo: "departamento", problema: "Use financeiro, engenharia-obras ou energia-opm." }]);
    const portao = PORTAO_DO_DEPARTAMENTO[departamento.data];
    if (portao && this.config.get<boolean>(portao) !== true) throw new NotFoundException();
    return true;
  }
}
