"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { comEntradasNovas, hrefDoProjeto, type Projeto } from "../../lib/prototipo-centro-de-custo";
import { Button } from "../ui";
import { entradasNovasDe, NovaEntradaDoProjeto, useEntradasNovas } from "./nova-entrada-do-projeto";
import { ProjetoDoCentroDeCusto, type TelasDeOrigem } from "./projeto-do-centro-de-custo";

/** A página inteira do projeto (PLU-362), com a Nova entrada: a forma anterior à ficha em modal, mantida para comparar. */
export function PaginaDoProjeto({ projeto, outros, abre }: { projeto: Projeto; outros: readonly Projeto[]; abre: TelasDeOrigem }) {
  const novas = useEntradasNovas();
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 8000); return () => clearTimeout(t); }, [aviso]);
  const p = comEntradasNovas(projeto, entradasNovasDe(novas, projeto.id));
  return <>
    <ProjetoDoCentroDeCusto projeto={p} outros={outros} abre={abre} hrefDe={hrefDoProjeto}
      acao={<Button icon={<Plus size={16} />} onClick={() => setCriando(true)}>Nova entrada</Button>}
      aviso={aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null} />
    {criando ? <NovaEntradaDoProjeto projeto={projeto} aoFechar={() => setCriando(false)}
      aoCriar={() => { setCriando(false); setAviso("Entrada criada em Lançamentos, vinculada a este projeto."); }} /> : null}
  </>;
}
