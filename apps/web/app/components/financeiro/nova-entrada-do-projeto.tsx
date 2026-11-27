"use client";

import { Building2, CalendarDays, FolderKanban, Lock, Plus, Receipt, UserRound } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";

import { competenciasParaEscolher } from "../../lib/cobranca-manual";
import { hojeEmManaus, ROTULO_DA_EMPRESA } from "../../lib/compras";
import { valorEmDigitacao } from "../../lib/ficha-do-lancamento";
import { entradaNova, problemasDaNovaEntrada, type CamposDaNovaEntrada, type Entrada, type Projeto } from "../../lib/prototipo-centro-de-custo";
import estilosCompras from "../compras/compras.module.css";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, TextField, TextareaField } from "../ui";
import styles from "./centro-de-custo.module.css";

/**
 * Entradas criadas no protótipo do Centro de custo (PLU-362): só em memória,
 * nesta aba do navegador. Valem para a lista, a ficha em modal e a página do
 * projeto enquanto a pessoa navega; recarregar a página apaga tudo. Nascem
 * aqui, no cliente; não vêm do módulo de exemplos.
 */
type Estado = Readonly<Record<string, readonly Entrada[]>>;
let estado: Estado = {};
let sequencia = 0;
const ouvintes = new Set<() => void>();
const NENHUMA: readonly Entrada[] = [];
const VAZIO: Estado = {};

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

function guardar(projetoId: string, entrada: Entrada) {
  estado = { ...estado, [projetoId]: [entrada, ...(estado[projetoId] ?? NENHUMA)] };
  for (const ouvinte of ouvintes) ouvinte();
}

/** As entradas criadas nesta sessão, por projeto. */
export function useEntradasNovas(): Estado {
  return useSyncExternalStore(assinar, () => estado, () => VAZIO);
}

export const entradasNovasDe = (novas: Estado, projetoId: string): readonly Entrada[] => novas[projetoId] ?? NENHUMA;

function CampoTravado({ rotulo, icone, children }: { rotulo: string; icone: ReactNode; children: ReactNode }) {
  return <div className="ui-field">
    <span className="ui-field-label">{rotulo}</span>
    <div className={`${estilosCompras.escolhido} ${styles.travado}`}>
      <span className={styles.valorTravado}>{icone}{children}</span>
      <Lock size={14} aria-hidden="true" />
    </div>
  </div>;
}

/**
 * Nova entrada a partir do centro de custo (pedido do André em 27/11/2026): o
 * formulário de cobrança do Financeiro com o cliente, o projeto e a empresa já
 * preenchidos e travados. A entrada continua sendo um lançamento do Financeiro;
 * o centro de custo só oferece o atalho. No protótipo, criar a guarda em memória.
 */
export function NovaEntradaDoProjeto({ projeto, aoFechar, aoCriar }: { projeto: Projeto; aoFechar: () => void; aoCriar: (entrada: Entrada) => void }) {
  const hoje = hojeEmManaus();
  const competencias = competenciasParaEscolher(hoje);
  const [campos, setCampos] = useState<CamposDaNovaEntrada>({ descricao: "", competencia: competencias[1]?.value ?? competencias[0]!.value, valor: "", vencimento: "", observacao: "" });
  const [erros, setErros] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const mudar = (parcial: Partial<CamposDaNovaEntrada>) => setCampos((c) => ({ ...c, ...parcial }));

  function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const problemas = problemasDaNovaEntrada(campos, hoje);
    setErros(problemas);
    if (Object.keys(problemas).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    sequencia += 1;
    const entrada = entradaNova(campos, sequencia);
    guardar(projeto.id, entrada);
    aoCriar(entrada);
  }

  return <Dialog title="Nova entrada" icon={<Receipt size={20} />} onClose={aoFechar}
    description="Uma cobrança em Lançamentos, já vinculada a este projeto."
    footer={<Button type="submit" form="form-nova-entrada-do-projeto" icon={<Plus size={16} />}>Criar entrada</Button>}>
    <form ref={formRef} id="form-nova-entrada-do-projeto" className="ui-dialog-form" onSubmit={criar} noValidate>
      {Object.keys(erros).length ? <Alert tone="danger" title="Erro: confira os campos destacados." /> : null}
      <Alert tone="warning" title="Protótipo: a entrada fica só nesta tela e some ao recarregar a página." />
      <div className="ui-dialog-grid">
        <CampoTravado rotulo="Cliente" icone={<UserRound size={15} aria-hidden="true" />}>{projeto.cliente.nome}</CampoTravado>
        <CampoTravado rotulo="Empresa" icone={<Building2 size={15} aria-hidden="true" />}>{ROTULO_DA_EMPRESA[projeto.empresa]}</CampoTravado>
      </div>
      <CampoTravado rotulo="Projeto" icone={<FolderKanban size={15} aria-hidden="true" />}>{projeto.nome}</CampoTravado>
      <p className={`ui-field-hint ${styles.dicaTravada}`}>Cliente, projeto e empresa vêm do centro de custo. Para outro projeto, crie a entrada a partir dele ou em Lançamentos.</p>
      <div className="ui-dialog-grid">
        <CampoDeMenu label="Competência" required options={competencias} value={campos.competencia} icon={<CalendarDays />} hint="O mês do serviço cobrado." error={erros.competencia}
          onChange={(v) => mudar({ competencia: v })} />
        <DatePicker label="Vencimento" required min={hoje} value={campos.vencimento} onChange={(v) => mudar({ vencimento: v })} error={erros.vencimento} />
      </div>
      <TextField label="Descrição" required maxLength={200} value={campos.descricao} onChange={(e) => mudar({ descricao: e.target.value })} placeholder="Ex.: 4ª parcela · comissionamento" error={erros.descricao} />
      <TextField label="Valor" required inputMode="decimal" prefix="R$" placeholder="0,00" value={campos.valor} onChange={(e) => mudar({ valor: valorEmDigitacao(e.target.value) })} error={erros.valor} />
      <TextareaField label="Observação" maxLength={2000} value={campos.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />
      <p className="ui-field-hint">No sistema real, a categoria e a conta corrente se escolhem como em Nova cobrança.</p>
    </form>
  </Dialog>;
}
