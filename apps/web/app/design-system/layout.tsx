import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { designSystemHabilitado } from "../lib/design-system-habilitado";

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  if (!designSystemHabilitado(process.env.NODE_ENV)) notFound();
  return children;
}
