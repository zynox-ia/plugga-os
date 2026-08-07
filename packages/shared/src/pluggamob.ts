import { z } from "zod";

export const pluggamobModeSchema = z.literal("mock");

export const pluggamobOverviewSchema = z.object({
  mode: pluggamobModeSchema,
  sessionsToday: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  pendingSettlements: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export type PluggamobOverview = z.infer<typeof pluggamobOverviewSchema>;
