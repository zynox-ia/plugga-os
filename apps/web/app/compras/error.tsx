"use client";

import { ErroDeRota } from "../components/estado-de-rota";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroDeRota error={error} reset={reset} modulo="Compras" />;
}
