import type { Coluna } from "../../Planilha";
import { TelaRelatorio, type FiltrosRelatorio } from "../TelaRelatorio";

// Mesmas colunas do relatório de passagens exportado da catraca.
const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", largura: "w-28" },
  { campo: "hora", rotulo: "Hora", tipo: "texto", largura: "w-20" },
  { campo: "cliente_id", rotulo: "ID", tipo: "texto", largura: "w-24" },
  { campo: "tipo", rotulo: "Tipo", tipo: "texto", largura: "w-24" },
  { campo: "nome", rotulo: "Nome", tipo: "texto", largura: "min-w-56" },
  { campo: "entrada_por", rotulo: "Entrada por", tipo: "texto", largura: "w-40" },
  { campo: "dispositivo", rotulo: "Dispositivo", tipo: "texto", largura: "w-28" },
  { campo: "liberado_por", rotulo: "Liberado por", tipo: "texto", largura: "w-28" },
  { campo: "motivo", rotulo: "Motivo", tipo: "texto", largura: "w-44" },
  { campo: "unidade_origem", rotulo: "Unidade de origem", tipo: "texto", largura: "w-48" },
  { campo: "acao", rotulo: "Ação", tipo: "texto", largura: "w-24" },
];

export default function RelatorioFrequenciaPage({ searchParams }: { searchParams: Promise<FiltrosRelatorio> }) {
  return (
    <TelaRelatorio
      searchParams={searchParams}
      tipo="passagens"
      titulo="Relatório de frequência"
      descricao="Passagens na catraca, importadas da planilha diária. Abre no dia anterior; use os filtros para ver um dia, um mês ou um ano."
      caminho="/frequencia/passagens"
      colunas={COLUNAS}
      nomeItem={["passagem", "passagens"]}
    />
  );
}
