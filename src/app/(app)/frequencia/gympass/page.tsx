import type { Coluna } from "../../Planilha";
import { TelaRelatorio, type FiltrosRelatorio } from "../TelaRelatorio";

// Mesmas colunas do relatório de check-ins exportado do Gympass (Wellhub).
const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", largura: "w-28" },
  { campo: "hora", rotulo: "Hora", tipo: "hora", largura: "w-20" },
  { campo: "visitante", rotulo: "Visitante", tipo: "texto", largura: "min-w-56" },
  { campo: "wellhub_id", rotulo: "ID do Wellhub", tipo: "texto", largura: "w-36" },
  { campo: "produto", rotulo: "Produto", tipo: "texto", largura: "w-44" },
  { campo: "periodo_checkin", rotulo: "Período de check-in", tipo: "texto", largura: "w-40" },
  { campo: "tipo_checkin", rotulo: "Tipo de check-in", tipo: "texto", largura: "w-32" },
  { campo: "pagamento", rotulo: "Pagamento", tipo: "moeda", largura: "w-28" },
  { campo: "unidade", rotulo: "Unidade", tipo: "texto", largura: "min-w-64" },
];

export default function RelatorioGympassPage({ searchParams }: { searchParams: Promise<FiltrosRelatorio> }) {
  return (
    <TelaRelatorio
      searchParams={searchParams}
      tipo="gympass"
      titulo="Relatório Gympass"
      descricao="Check-ins do Gympass (Wellhub), importados da planilha diária. Abre no dia anterior; use os filtros para ver um dia, um mês ou um ano."
      caminho="/frequencia/gympass"
      colunas={COLUNAS}
      nomeItem={["check-in", "check-ins"]}
    />
  );
}
