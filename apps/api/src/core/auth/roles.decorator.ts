import { SetMetadata } from "@nestjs/common";
import type { RoleKey } from "@plugga/shared";

export const ROLES_METADATA = "plugga:roles";

export const Roles = (...roles: RoleKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA, roles);
