"use client";

import { rotulosDaEtapaDeCompra, type EtapaDeCompra, type EventoDaOrdem, type OrdemDeServico } from "@plugga/shared";
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardPen,
  FilePlus2,
  MapPin,
  Package,
  Pencil,
  Signature,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { dataEmManaus, diaLegivel, hrefDeCompras, numeroDoPedido, tamanhoDoArquivo } from "../../lib/compras";
import { horaEmManaus } from "../../lib/ficha-do-pedido";
import { eventosPorDia, urlDoArquivoDaOrdem } from "../../lib/ordens-de-servico";
import fichaCompras from "../compras/ficha-do-pedido.module.css";
import historico from "../pipelines/historico-do-lead.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { FileDropzone } from "../ui";
import styles from "./ficha-da-ordem.module.css";

export function EquipamentoDaOrdem({ ordem }: { ordem: OrdemDeServico }) {
  const e = ordem.equipamento;
  const nada = !e.equipamento && !e.fabricante && !e.modelo && !e.numeroSerie;
  return <div className={fichaCompras.secao}>
    <div className={fichaCompras.barra}><div><h3>Equipamento</h3><p>O equipamento atendido e o problema relatado.</p></div></div>
    <dl className={visao.grade}>
      <div><dt>Equipamento</dt><dd>{e.equipamento ?? "Não informado"}</dd></div>
      <div><dt>Fabricante</dt><dd>{e.fabricante ?? "Não informado"}</dd></div>
      <div><dt>Modelo</dt><dd>{e.modelo ?? "Não informado"}</dd></div>
      <div><dt>Número de série</dt><dd>{e.numeroSerie ?? "Não informado"}</dd></div>
      {ordem.uc ? <div><dt>Unidade consumidora</dt><dd>{ordem.uc.codigo}<small>{ordem.uc.distribuidora}</small></dd></div> : null}
    </dl>
    {nada && ordem.acoesPermitidas.includes("editar") ? <p className={fichaCompras.muted}>Use Editar para registrar fabricante, modelo e número de série.</p> : null}
    <section className={visao.secao} aria-label="Problema relatado">
      <h3>Problema relatado</h3>
      <p className={visao.notas}>{ordem.descricao}</p>
    </section>
  </div>;
}

/** Fotos do laudo, no armazenamento do Plugga OS. Enviar vale em campo e no laudo, se a API permitir. */
export function EvidenciasDaOrdem({ ordem, ocupado, aoEnviar }: { ordem: OrdemDeServico; ocupado: boolean; aoEnviar: (arquivos: File[]) => void }) {
  const pode = ordem.acoesPermitidas.includes("enviar_foto");
  return <div className={fichaCompras.secao}>
    <div className={fichaCompras.barra}><div>
      <h3>Evidências <span className={fichaCompras.contaAba}>{String(ordem.fotos.length).padStart(2, "0")}</span></h3>
      <p>Fotos do campo. O laudo exige ao menos uma.</p>
    </div></div>
    {pode ? <FileDropzone label="Enviar fotos (JPG ou PNG, até 25 MB cada)" value={[]} disabled={ocupado} onChange={(arquivos) => { if (arquivos.length) aoEnviar(arquivos); }} /> : null}
    {ordem.fotos.length === 0
      ? <div className={styles.semFotos} role="status"><Camera size={20} aria-hidden="true" /><p>{pode ? "Nenhuma foto ainda. Envie as fotos do campo antes de registrar o laudo." : "Nenhuma foto nesta O.S."}</p></div>
      : <ul className={styles.fotos}>
        {ordem.fotos.map((f, i) => <li key={f.id}>
          <a href={urlDoArquivoDaOrdem(f.url)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto ${i + 1}: ${f.nome}`}>
            <img src={urlDoArquivoDaOrdem(f.url)} alt={`Foto ${i + 1} do campo`} loading="lazy" />
          </a>
          <span className={styles.legendaFoto}><span className={styles.cortado}>{f.nome}</span><small>{tamanhoDoArquivo(f.tamanhoBytes)} · {dataEmManaus(f.enviado.em)}{f.enviado.por ? ` · ${f.enviado.por.nome}` : ""}</small></span>
        </li>)}
      </ul>}
  </div>;
}

/** Pedidos de material da O.S., criados em Suprimentos com a origem aqui (PLU-327). */
export function MaterialDaOrdem({ ordem, podeAbrirCompras, acaoDePedir }: { ordem: OrdemDeServico; podeAbrirCompras: boolean; acaoDePedir: ReactNode }) {
  return <div className={fichaCompras.secao}>
    <div className={fichaCompras.barra}>
      <div><h3>Material <span className={fichaCompras.contaAba}>{String(ordem.pedidosDeMaterial.length).padStart(2, "0")}</span></h3><p>Pedidos de compra abertos em Suprimentos para esta O.S.</p></div>
      {acaoDePedir}
    </div>
    {ordem.pedidosDeMaterial.length === 0
      ? <div className={styles.semFotos} role="status"><Package size={20} aria-hidden="true" /><p>Nenhum material pedido para esta O.S.</p></div>
      : <ul className={styles.pedidos}>
        {ordem.pedidosDeMaterial.map((p) => <li key={p.id}>
          <span className={styles.iconePedido} aria-hidden="true"><Package size={16} /></span>
          <span className={styles.textoPedido}>
            {podeAbrirCompras
              ? <a href={hrefDeCompras({ visao: "quadro", cancelados: false, situacao: "em_andamento" }, p.id)}>{p.titulo}</a>
              : <strong>{p.titulo}</strong>}
            <small>{numeroDoPedido(p.numero)} · aberto em {dataEmManaus(p.createdAt)}</small>
          </span>
          <span className={styles.seloPedido}>{p.situacao === "cancelado" ? "Cancelado" : (rotulosDaEtapaDeCompra[p.etapa as EtapaDeCompra] ?? p.etapa)}</span>
        </li>)}
      </ul>}
  </div>;
}

const ICONE_DO_EVENTO: Record<EventoDaOrdem["tipo"], LucideIcon> = {
  criada: FilePlus2, editada: Pencil, agendada: CalendarCheck, remarcada: CalendarClock, checkin: MapPin, checkin_antecipado: MapPin,
  foto_enviada: Camera, laudo_registrado: ClipboardPen, termo_assinado: Signature, concluida: CheckCircle2, adiada: Undo2, cancelada: Ban, material_pedido: Package,
};

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/** A linha do tempo da O.S., agrupada por dia de Manaus, com quem fez e o motivo. */
export function LinhaDoTempoDaOrdem({ ordem, hoje }: { ordem: OrdemDeServico; hoje: string }) {
  const dias = eventosPorDia(ordem.historico, hoje);
  return <div className={fichaCompras.secao}>
    <div className={fichaCompras.barra}><div><h3>Linha do tempo</h3><p>Quem fez o quê, com data e hora de Manaus.{ordem.situacao === "adiada" && ordem.adiamento ? ` Nova data: ${diaLegivel(ordem.adiamento.novaData)}.` : ""}</p></div></div>
    {dias.length === 0 ? <p className={fichaCompras.muted}>Nada registrado ainda.</p> : <section className={historico.historico} aria-label="Linha do tempo da O.S.">
      {dias.map((grupo) => <section key={grupo.dia} className={historico.historicoDia} aria-label={grupo.rotulo}>
        <h3 className={historico.historicoData}>{grupo.rotulo}</h3>
        <ol className={historico.historicoLista}>
          {grupo.itens.map((e) => {
            const Icone = ICONE_DO_EVENTO[e.tipo];
            return <li key={e.id} className={historico.historicoEvento}>
              <span className={historico.historicoIcone} aria-hidden="true"><Icone size={16} /></span>
              <time className={historico.historicoHora} dateTime={e.em}>{horaEmManaus(e.em)}</time>
              <div className={historico.historicoConteudo}>
                <div className={historico.historicoLinha}>
                  <span className={historico.historicoAvatar} aria-hidden="true">{e.por ? iniciais(e.por.nome) : <UserRound size={13} />}</span>
                  <p>{e.por ? <><strong>{e.por.nome}</strong> · {e.descricao}</> : e.descricao}</p>
                </div>
                {e.detalhe ? <div className={`${historico.historicoDetalhe} ${historico.historicoAnotacao}`}>{e.detalhe}</div> : null}
              </div>
            </li>;
          })}
        </ol>
      </section>)}
    </section>}
  </div>;
}
