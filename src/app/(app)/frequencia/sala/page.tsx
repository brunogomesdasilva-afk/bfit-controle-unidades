import type { Coluna } from "../../Planilha";
import { excluirSala, salvarSala } from "../../lancamentos";
import { TelaMensal } from "../../TelaMensal";

const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: "w-36" },
  { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true, largura: "w-28" },
  { campo: "musculacao", rotulo: "Musculação", tipo: "inteiro", obrigatorio: true, largura: "w-32" },
  { campo: "cardio", rotulo: "Cardio", tipo: "inteiro", obrigatorio: true, largura: "w-32" },
  { campo: "professores", rotulo: "Quantidade de professores", tipo: "inteiro", largura: "w-48" },
  { campo: "total_alunos", rotulo: "Total de alunos", tipo: "calculado", largura: "w-32" },
  { campo: "alunos_por_professor", rotulo: "Alunos por professor", tipo: "calculado", largura: "w-40" },
];

// Musculação + cardio, e esse total dividido pelos professores em sala (vazio sem professor informado).
function calcular(r: Record<string, unknown>) {
  const total = Number(r.musculacao ?? 0) + Number(r.cardio ?? 0);
  const professores = Number(r.professores ?? 0);
  return { total_alunos: total, alunos_por_professor: professores > 0 ? total / professores : null };
}

export default function ContagemSalaPage({ searchParams }: { searchParams: Promise<{ academia?: string; mes?: string }> }) {
  return (
    <TelaMensal
      searchParams={searchParams}
      titulo="Contagem de sala"
      descricao="Quantas pessoas estavam na musculação e no cardio em cada horário."
      caminho="/frequencia/sala"
      tabela="contagem_sala"
      colunas={COLUNAS}
      ordem={["data", "horario"]}
      salvar={salvarSala}
      excluir={excluirSala}
      rotuloNovo="+ Nova contagem"
      calcular={calcular}
    />
  );
}
