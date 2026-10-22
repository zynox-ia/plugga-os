export type ColorToken = { cssVar: string; name: string; usage: string };

export const BLUE_TONAL_SCALE: ColorToken[] = [
  { cssVar: "--color-navy-950", name: "Marinho 950", usage: "Superfícies profundas" },
  { cssVar: "--color-navy-900", name: "Marinho 900", usage: "Navegação e cartões escuros" },
  { cssVar: "--color-navy-850", name: "Marinho 850", usage: "Títulos e texto principal" },
  { cssVar: "--color-navy-800", name: "Marinho 800", usage: "Apoio em superfícies escuras" },
  { cssVar: "--color-blue-700", name: "Azul 700", usage: "Foco e estados de interação" },
  { cssVar: "--color-blue-600", name: "Azul 600", usage: "Ação principal e seleção" },
  { cssVar: "--color-blue-500", name: "Azul 500", usage: "Destaques e gráficos" },
  { cssVar: "--color-cyan-400", name: "Ciano 400", usage: "Acentos em fundos escuros" },
  { cssVar: "--color-cyan-100", name: "Ciano 100", usage: "Superfícies de apoio" },
  { cssVar: "--color-cyan-50", name: "Ciano 50", usage: "Fundos de baixa intensidade" },
];
export const SURFACE_TOKENS: ColorToken[] = [
  { cssVar: "--ui-surface", name: "Superfície", usage: "Campos e conteúdo" },
  { cssVar: "--panel", name: "Painel", usage: "Superfícies translúcidas" },
  { cssVar: "--ui-subtle", name: "Apoio", usage: "Grupos de controles e estados" },
  { cssVar: "--ui-divider", name: "Divisória", usage: "Separação de conteúdo" },
];
export const STATUS_TOKENS: ColorToken[] = [
  { cssVar: "--ui-success", name: "Sucesso", usage: "Operação concluída" },
  { cssVar: "--ui-warning", name: "Atenção", usage: "Revisão necessária" },
  { cssVar: "--ui-danger", name: "Erro", usage: "Falha e ação destrutiva" },
  { cssVar: "--ui-primary", name: "Informação", usage: "Orientação e interação" },
];
export const SPACING_TOKENS = [
  { name: "--space-3xs", size: "2px", usage: "Ajustes de ícones" },
  { name: "--space-2xs", size: "4px", usage: "Separação mínima" },
  { name: "--space-xs", size: "8px", usage: "Ícone e rótulo" },
  { name: "--space-sm", size: "12px", usage: "Itens relacionados" },
  { name: "--space-md", size: "16px", usage: "Grupos de controles" },
  { name: "--space-lg", size: "24px", usage: "Conteúdo de cartões" },
  { name: "--space-xl", size: "32px", usage: "Seções de conteúdo" },
  { name: "--space-2xl", size: "48px", usage: "Grandes separações" },
  { name: "--space-3xl", size: "64px", usage: "Respiro entre áreas" },
];
export const RADIUS_TOKENS = [
  { name: "--radius-xs", size: "4px", usage: "Marcas e pequenos indicadores" },
  { name: "--radius-sm", size: "8px", usage: "Campos de formulário" },
  { name: "--radius-md", size: "12px", usage: "Menus e blocos internos" },
  { name: "--radius-lg", size: "18px", usage: "Superfícies de conteúdo" },
  { name: "--radius-xl", size: "24px", usage: "Cartões e painéis" },
  { name: "--radius-full", size: "9999px", usage: "Botões e indicadores" },
];
export const TYPOGRAPHY_TOKENS = [
  { role: "Título de página", size: "32px", weight: 500, leading: "1,2", lineHeight: "var(--line-height-title)", example: "Visão geral dos resultados da operação" },
  { role: "Título de seção", size: "24px", weight: 500, leading: "1,3", lineHeight: "var(--line-height-heading)", example: "Acompanhe os resultados e as próximas entregas" },
  { role: "Título de cartão", size: "18px", weight: 500, leading: "1,4", lineHeight: "var(--line-height-subheading)", example: "Operações em andamento com a sua equipe" },
  { role: "Texto de apoio", size: "14px", weight: 400, leading: "1,5", lineHeight: "var(--line-height-body)", example: "As informações que sua equipe precisa para acompanhar as operações e tomar decisões com clareza." },
  { role: "Rótulos e controles", size: "13px", weight: 500, leading: "1,4", lineHeight: "var(--line-height-control)", example: "Selecione a equipe responsável pela operação" },
  { role: "Legendas", size: "12px", weight: 400, leading: "1,5", lineHeight: "var(--line-height-body)", example: "Atualizado há poucos minutos. Os dados acompanham as mudanças da operação." },
];
