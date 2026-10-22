import type { ComponentType } from "react";
import { OverviewPage } from "./pages/overview-page";
import { ColorsPage } from "./pages/foundations/colors-page";
import { TypographyPage } from "./pages/foundations/typography-page";
import { SpacingPage } from "./pages/foundations/spacing-page";
import { RadiusPage } from "./pages/foundations/radius-page";
import { IconsPage } from "./pages/foundations/icons-page";

import { ButtonsPage } from "./pages/components/buttons-page";
import { MenusPage } from "./pages/components/menus-page";
import { NavigationPage } from "./pages/components/navigation-page";
import { SelectionPage } from "./pages/forms/selection-page";
import { TagsPage } from "./pages/components/tags-page";

import { SelectorsPage } from "./pages/forms/selectors-page";
import { InputsPage } from "./pages/forms/inputs-page";

import { ModalsPage } from "./pages/feedback/modals-page";
import { AlertsPage } from "./pages/feedback/alerts-page";

import { TablesPage } from "./pages/data-display/tables-page";
import { CardsPage } from "./pages/data-display/cards-page";

export interface DocItem {
  slug: string;
  title: string;
  keywords?: string;
  component: ComponentType;
}

export interface DocSection {
  slug: string;
  title: string;
  items: DocItem[];
}

export const SECTIONS: DocSection[] = [
  { slug: "start", title: "Comece por aqui", items: [{ slug: "overview", title: "Visão geral", component: OverviewPage }] },
  {
    slug: "foundations",
    title: "Fundamentos",
    items: [
      { slug: "colors", title: "Cores", keywords: "paleta tokens", component: ColorsPage },
      { slug: "typography", title: "Tipografia", component: TypographyPage },
      { slug: "spacing", title: "Espaçamento", component: SpacingPage },
      { slug: "radius", title: "Bordas e raios", component: RadiusPage },
      { slug: "icons", title: "Ícones", component: IconsPage },
    ],
  },
  {
    slug: "components",
    title: "Ações e navegação",
    items: [
      { slug: "buttons", title: "Botões", keywords: "button ações", component: ButtonsPage },
      { slug: "menus", title: "Menus suspensos", keywords: "check dropdown", component: MenusPage },
      { slug: "navigation", title: "Abas e navegação", keywords: "tabs breadcrumbs", component: NavigationPage },
    ],
  },
  {
    slug: "forms",
    title: "Formulários",
    items: [
      { slug: "inputs", title: "Campos de entrada", keywords: "input field textarea data", component: InputsPage },
      { slug: "selectors", title: "Seletores", keywords: "select combobox dropdown múltipla", component: SelectorsPage },
      { slug: "selection", title: "Checkbox, radio e switch", keywords: "check seleção controles", component: SelectionPage },
    ],
  },
  {
    slug: "feedback",
    title: "Feedback",
    items: [
      { slug: "modals", title: "Modais e diálogos", component: ModalsPage },
      { slug: "alerts", title: "Alertas e estados", keywords: "carregamento vazio erro sucesso", component: AlertsPage },
    ],
  },
  {
    slug: "data-display",
    title: "Dados e superfícies",
    items: [
      { slug: "tags", title: "Tags e indicadores", keywords: "badge pill status", component: TagsPage },
      { slug: "tables", title: "Tabelas", component: TablesPage },
      { slug: "cards", title: "Cartões", component: CardsPage },
    ],
  },
];
