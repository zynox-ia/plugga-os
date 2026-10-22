"use client";

import type { Pipeline } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { hrefDaVisao, type Visao } from "../../lib/negocios";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { Icone, type NomeDoIcone } from "./icones";
import estilos from "./tela-pipelines.module.css";

const VISOES: { valor: Visao; rotulo: string; icone: NomeDoIcone }[] = [
  { valor: "kanban", rotulo: "Kanban", icone: "etapas" },
  { valor: "lista", rotulo: "Lista", icone: "lista" },
  { valor: "calendario", rotulo: "Calendário", icone: "calendario" },
];

export function NavegacaoPipelines({ pipelines, selecionado, visao }: { pipelines: Pipeline[]; selecionado: Pipeline; visao: Visao }) {
  const router = useRouter();
  return (
    <div className={estilos.navegacao}>
      <nav className={estilos.visoes} aria-label="Visualização dos negócios">
        {VISOES.map((opcao) => (
          <Link key={opcao.valor} href={hrefDaVisao(selecionado.id, opcao.valor)} aria-current={visao === opcao.valor ? "page" : undefined} scroll={false}>
            <Icone nome={opcao.icone} tamanho={16} />
            {opcao.rotulo}
          </Link>
        ))}
      </nav>
      <label className={estilos.pipeline}>
        <span>Pipeline</span>
        <select aria-label="Selecionar pipeline" value={selecionado.id} onChange={(e) => router.push(hrefDaVisao(e.target.value, visao), { scroll: false })}>
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>{pipeline.name} · {EMPRESAS_POR_ID[pipeline.companyId].nome}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
