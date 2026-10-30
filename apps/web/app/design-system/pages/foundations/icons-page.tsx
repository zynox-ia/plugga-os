import { DocPage, DocSection, CodeBadge, Usage } from "../../kit/doc";
import { CopyButton } from "../../kit/copy-button";
import { IconCheck, IconX, IconCopy, IconChevronDown, IconSearch, IconAlertTriangle, IconSettings, IconArrowRight, IconPlus, IconFilter, IconTrash, IconInfo, IconDownload, IconEye, IconSave, IconEdit, IconReset } from "../../../components/ui";

const ICONS = [
  { name: "IconCheck", component: IconCheck, usage: "Confirmar" },
  { name: "IconX", component: IconX, usage: "Fechar ou remover" },
  { name: "IconCopy", component: IconCopy, usage: "Copiar" },
  { name: "IconChevronDown", component: IconChevronDown, usage: "Expandir" },
  { name: "IconSearch", component: IconSearch, usage: "Buscar" },
  { name: "IconAlertTriangle", component: IconAlertTriangle, usage: "Atenção" },
  { name: "IconSettings", component: IconSettings, usage: "Configurações" },
  { name: "IconArrowRight", component: IconArrowRight, usage: "Avançar" },
  { name: "IconPlus", component: IconPlus, usage: "Adicionar" },
  { name: "IconFilter", component: IconFilter, usage: "Filtrar" },
  { name: "IconTrash", component: IconTrash, usage: "Excluir" },
  { name: "IconInfo", component: IconInfo, usage: "Informação" },
  { name: "IconDownload", component: IconDownload, usage: "Exportar" },
  { name: "IconEye", component: IconEye, usage: "Ver detalhes" },
  { name: "IconSave", component: IconSave, usage: "Salvar" },
  { name: "IconEdit", component: IconEdit, usage: "Editar" },
  { name: "IconReset", component: IconReset, usage: "Restaurar" },
];

export function IconsPage() {
  return <DocPage title="Ícones" category="Fundamentos" description="Ícones lineares complementam o texto. Um botão somente com ícone precisa de um nome acessível que descreva a ação.">
    <DocSection title="Ícones compartilhados" description="Selecione um ícone para copiar seu exemplo de uso.">
      <div className="ds-icon-grid">{ICONS.map(({ name, component: Icon, usage }) => <CopyButton key={name} label={name} value={`<${name} />`} className="ds-icon-card"><Icon /><CodeBadge>{name}</CodeBadge><span className="ds-demo-note">{usage}</span></CopyButton>)}</div>
      <Usage>{'import { Button, IconX } from "../components/ui";\n\n<Button variant="secondary" icon={<IconX />} iconOnly\n  aria-label="Fechar painel" onClick={fechar} />'}</Usage>
    </DocSection>
  </DocPage>;
}
