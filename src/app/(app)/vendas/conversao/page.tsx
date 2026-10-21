import { excluirConversao, salvarConversao } from "../../lancamentos";
import type { Coluna } from "../../Planilha";
import { TelaMensal } from "../../TelaMensal";

// Motivos de não conversão (lista fixa). Motivos antigos digitados à mão continuam aparecendo nas linhas já lançadas.
const MOTIVOS = [
  "Só veio conhecer e saber valores",
  "Vai verificar com familiares",
  "Conhecer o Wellhub / Gympass",
  "Voltará em um outro dia / Vai pensar",
  "Gostaria de pagar no débito",
  "Não tem cartão de crédito",
  "Menor de idade",
];

const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: "w-36" },
  { campo: "visita", rotulo: "Visita", tipo: "texto", obrigatorio: true, largura: "min-w-56" },
  {
    campo: "motivo",
    rotulo: "Motivo da não conversão",
    tipo: "opcoes",
    largura: "min-w-80",
    opcoes: MOTIVOS.map((m) => ({ valor: m, rotulo: m })),
  },
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
