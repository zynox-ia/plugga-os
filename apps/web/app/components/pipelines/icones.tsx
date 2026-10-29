import { useState, type ReactNode } from "react";
import { User } from "lucide-react";

/** Ícones de traço das telas de Pipelines, no mesmo desenho dos ícones da barra lateral. */
const TRACOS = {
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  negocios: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  valor: (
    <>
      <path d="M12 2v20" />
      <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  etapas: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>
  ),
  equipe: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  check: <path d="m5 12 5 5L20 7" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  lixeira: (
    <>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </>
  ),
  cima: <path d="m18 15-6-6-6 6" />,
  baixo: <path d="m6 9 6 6 6-6" />,
  alca: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  arquivo: (
    <>
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </>
  ),
  lista: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  filtros: <path d="M3 6h18M6 12h12M9 18h6" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  mais_opcoes: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  seta: <path d="M5 12h14M13 6l6 6-6 6" />,
  calendario: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </>
  ),
  trofeu: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NomeDoIcone = keyof typeof TRACOS;

export function Icone({ nome, tamanho = 16 }: { nome: NomeDoIcone; tamanho?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRACOS[nome]}
    </svg>
  );
}

const CORES_DE_AVATAR = ["#0077FF", "#7C5CFF", "#0B7A57", "#F5A524", "#E5484D", "#00A3FF"];

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** Avatar com foto ou ícone quando não houver foto (padrão global do design system). */
export function Avatar({
  id,
  nome,
  avatarUrl,
  tamanho = "medio",
}: {
  id: string;
  nome: string;
  avatarUrl?: string | null;
  tamanho?: "pequeno" | "medio";
}) {
  const [erroImg, setErroImg] = useState(false);
  const soma = [...id].reduce((total, letra) => total + letra.charCodeAt(0), 0);
  const corFundo = CORES_DE_AVATAR[soma % CORES_DE_AVATAR.length];
  const iconeSize = tamanho === "pequeno" ? 13 : 15;

  if (avatarUrl && !erroImg) {
    return (
      <img
        src={avatarUrl}
        alt={nome}
        title={nome}
        className={`avatar-pessoa avatar-pessoa--${tamanho} avatar-pessoa--img`}
        onError={() => setErroImg(true)}
      />
    );
  }

  return (
    <span
      className={`avatar-pessoa avatar-pessoa--${tamanho}`}
      style={{ background: corFundo }}
      title={nome}
      aria-label={nome}
    >
      <User size={iconeSize} aria-hidden="true" strokeWidth={2} />
    </span>
  );
}
