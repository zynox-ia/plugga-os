import { z } from "zod";

export const roleKeys = [
  "admin",
  "diretoria",
  "pluggamob",
  "financeiro",
  "opm",
  "tech",
  "viewer",
] as const;

export const roleKeySchema = z.enum(roleKeys);

export type RoleKey = z.infer<typeof roleKeySchema>;
