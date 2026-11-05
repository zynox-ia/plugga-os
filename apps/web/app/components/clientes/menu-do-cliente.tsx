import type { ClientListItem } from "@plugga/shared";
import { Check, Eye, MoreHorizontal, X } from "lucide-react";
import { useRef, useState } from "react";

import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import styles from "./lista-clientes.module.css";

export function MenuDoCliente({ cliente, salvando, aoAbrir, aoMudarSituacao }: { cliente: ClientListItem; salvando: boolean; aoAbrir: () => void; aoMudarSituacao: () => void }) {
  const [aberto, setAberto] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  function escolher(acao: () => void) {
    setAberto(false);
    acao();
  }

  return <div className="menu-negocio" onClick={(evento) => evento.stopPropagation()}>
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild><button type="button" className="botao-icone cartao-negocio-menu-btn" disabled={salvando} aria-label={`Ações de ${cliente.name}`} aria-haspopup="menu"><MoreHorizontal size={16} aria-hidden="true" /></button></PopoverTrigger>
      <PopoverContent ref={menu} className={`menu-negocio-lista ${estilosLista.menuVidro} ${styles.menu}`} align="end" sideOffset={4} role="menu" aria-label={`Ações de ${cliente.name}`}
        onOpenAutoFocus={(evento) => { evento.preventDefault(); menu.current?.querySelector<HTMLButtonElement>("button")?.focus(); }}
        onKeyDown={(evento) => {
          const opcoes = Array.from(evento.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
          const atual = opcoes.indexOf(document.activeElement as HTMLButtonElement);
          const proximo = evento.key === "ArrowDown" ? (atual + 1) % opcoes.length : evento.key === "ArrowUp" ? (atual + opcoes.length - 1) % opcoes.length : evento.key === "Home" ? 0 : evento.key === "End" ? opcoes.length - 1 : -1;
          if (proximo >= 0) { evento.preventDefault(); opcoes[proximo]?.focus(); }
          if (evento.key === "Tab") setAberto(false);
        }}>
        <button type="button" role="menuitem" onClick={() => escolher(aoAbrir)}><Eye size={14} aria-hidden="true" />Ver ficha</button>
        <span className="menu-negocio-divisor" role="separator" />
        <button type="button" role="menuitem" disabled={salvando} className={cliente.active ? "menu-negocio--perdido" : "menu-negocio--ganho"} onClick={() => escolher(aoMudarSituacao)}>{cliente.active ? <X size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}{cliente.active ? "Inativar cliente" : "Ativar cliente"}</button>
      </PopoverContent>
    </Popover>
  </div>;
}
