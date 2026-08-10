import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@plugga/shared";

export const PERMISSIONS_METADATA = "plugga:permissions";

/**
 * Complementa `@Roles(...)`, não a substitui. `@Roles` decide o que a pessoa
 * é; `@Permissions` decide o que ela pode fazer dentro disso. Uma rota pode
 * ter as duas — o `RolesGuard` e o `PermissionsGuard` rodam em sequência,
 * cada um recusando por conta própria.
 */
export const Permissions = (...permissions: PermissionKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_METADATA, permissions);
