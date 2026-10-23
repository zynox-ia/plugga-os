"use client";

import { useState } from "react";
import { Alert, Button, EmptyState, Skeleton, IconReset, IconPlus } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function AlertsPage() {
  const [created, setCreated] = useState(false);
  return <DocPage title="Alertas e estados" category="Feedback" description="Explique o que está acontecendo e indique o próximo passo. Cor, texto e ícone trabalham juntos para transmitir o estado.">
    <DocSection title="Mensagens de contexto" description="Mensagens breves, próximas da ação ou do conteúdo a que se referem.">
      <Playground title="Variações semânticas" preview={<div className="ds-two-columns">
        <Alert title="Informação adicional">O relatório considera o período selecionado.</Alert>
        <Alert title="Alterações salvas" tone="success">Os dados do exemplo foram atualizados.</Alert>
        <Alert title="Revise antes de continuar" tone="warning">Há campos pendentes de preenchimento.</Alert>
        <Alert title="Não foi possível concluir" tone="danger">Verifique os campos e tente novamente.</Alert>
      </div>} />
    </DocSection>
    <DocSection title="Carregando e sem resultados" description="O espaço reservado reduz saltos de layout. O estado vazio explica como começar.">
      <div className="ds-two-columns">
        <Playground title="Carregamento" preview={<Skeleton label="Carregando operações" />} />
        <Playground title="Estado vazio" preview={created ? <Alert tone="success" title="Primeiro exemplo criado"><Button icon={<IconReset />} size="sm" variant="secondary" onClick={() => setCreated(false)}>Restaurar estado vazio</Button></Alert> : <EmptyState title="Nenhuma operação por aqui" action={<Button icon={<IconPlus />} onClick={() => setCreated(true)}>Criar primeira operação</Button>}>Comece adicionando uma operação.</EmptyState>} />
      </div>
      <Usage>{'import { Alert, EmptyState, Skeleton } from "../components/ui";\n\n<Alert tone="danger" title="Não foi possível salvar">\n  Revise os campos e tente novamente.\n</Alert>\n<Skeleton label="Carregando operações" />\n<EmptyState title="Nenhuma operação" action={<NovaOperacao />}>\n  Comece adicionando uma operação.\n</EmptyState>'}</Usage>
    </DocSection>
  </DocPage>;
}
