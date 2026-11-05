import { leadDocumentCategories } from "@plugga/shared";
import { File, FileSignature, FileText, Paperclip, Zap } from "lucide-react";
import { CATEGORIAS_DOCUMENTOS } from "../../lib/documentos-lead";
import { OptionLabel } from "../ui/select-option";
import { SelectItem } from "../ui/shadcn/select";

const ICONES_CATEGORIAS = {
  proposta: FileText,
  conta_de_energia: Zap,
  documento_do_cliente: File,
  procuracao_contrato: FileSignature,
  outros: Paperclip,
};

export function OpcoesCategoriasDocumentos() {
  return leadDocumentCategories.map((categoria) => {
    const Icone = ICONES_CATEGORIAS[categoria];
    return <SelectItem key={categoria} value={categoria}>
      <OptionLabel option={{ label: CATEGORIAS_DOCUMENTOS[categoria], icon: <Icone /> }} />
    </SelectItem>;
  });
}
