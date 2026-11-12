/** A conexão como está guardada: o token de renovação segue cifrado. */
export type ConexaoGuardada = {
  userId: string;
  googleEmail: string;
  /** Escopos concedidos, separados por espaço. */
  escopos: string;
  refreshTokenCifrado: string;
  iv: string;
  tag: string;
  conectadoEm: Date;
};

export type GravarConexao = Omit<ConexaoGuardada, "conectadoEm">;

/**
 * Persistência da conexão da agenda de cada pessoa. O banco só devolve a linha
 * de quem está na sessão (RLS), então ler a de outro usuário dá `null`, mesmo
 * para quem tem papel de plataforma. Quem decifra é o serviço; o repositório
 * nunca vê o token em claro.
 */
export abstract class ConexaoGoogleCalendarRepository {
  abstract buscar(userId: string): Promise<ConexaoGuardada | null>;
  /** Conectar de novo troca a conexão anterior (o token novo vale, o velho não importa mais). */
  abstract gravar(dados: GravarConexao): Promise<void>;
  /** Apagar o que não existe não é erro: o estado final é o mesmo. */
  abstract apagar(userId: string): Promise<void>;
}
