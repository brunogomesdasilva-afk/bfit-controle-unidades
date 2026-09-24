import { excluirConversao, salvarConversao } from "../../lancamentos";
import type { Coluna } from "../../Planilha";
import { TelaMensal } from "../../TelaMensal";

const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: "w-36" },
  { campo: "visita", rotulo: "Visita", tipo: "texto", obrigatorio: true, largura: "min-w-56" },
  { campo: "motivo", rotulo: "Motivo da não conversão", tipo: "texto", largura: "min-w-80" },
];

export default function ControleConversaoPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string; mes?: string }>;
}) {
  return (
    <TelaMensal
      searchParams={searchParams}
      titulo="Controle de conversão"
      descricao="Visitas que não viraram venda e o motivo da não conversão."
      caminho="/vendas/conversao"
      tabela="controle_conversao"
      colunas={COLUNAS}
      ordem={["data", "created_at"]}
      salvar={salvarConversao}
      excluir={excluirConversao}
      rotuloNovo="+ Nova visita"
    />
  );
}
