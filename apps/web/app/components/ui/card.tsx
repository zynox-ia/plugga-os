import type { ReactNode } from "react";
import { ShellCard } from "../plugga-shell";

export function Card({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return <ShellCard className={`ui-card ui-card--${tone}`}>{children}</ShellCard>;
}
