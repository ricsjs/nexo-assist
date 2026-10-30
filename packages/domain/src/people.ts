import { z } from "zod";

export const Employee = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  department: z.string(),
  passwordChangedAt: z.iso.datetime(),
});
export type Employee = z.infer<typeof Employee>;

export const SupportTeam = z.enum(["N1", "N2"]);
export type SupportTeam = z.infer<typeof SupportTeam>;

export const Analyst = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  team: SupportTeam,
});
export type Analyst = z.infer<typeof Analyst>;
