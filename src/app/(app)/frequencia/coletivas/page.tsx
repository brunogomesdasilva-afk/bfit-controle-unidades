import type { Coluna } from "../../Planilha";
import { excluirColetiva, salvarColetiva } from "../../lancamentos";
import { TelaMensal } from "../../TelaMensal";

const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: "w-36" },
  { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true, largura: "w-28" },
  { campo: "professor", rotulo: "Professor", tipo: "texto", largura: "min-w-48" },
  { campo: "modalidade", rotulo: "Modalidade", tipo: "texto", largura: "min-w-48" },
  { campo: "quantidade", rotulo: "Quantidade", tipo: "inteiro", obrigatorio: true, largura: "w-32" },
  // Preenchido quando outra pessoa deu a aula; aí o professor pode ficar em branco.
  { campo: "professor_substituto", rotulo: "Professor substituto", tipo: "texto", largura: "min-w-48" },
];

export default function ContagemColetivasPage({ searchParams }: { searchParams: Promise<{ academia?: string; mes?: string }> }) {
  return (
    <TelaMensal
      searchParams={searchParams}
      titulo="Contagem de coletivas"
      descricao="Alunos em cada aula coletiva."
      caminho="/frequencia/coletivas"
      tabela="contagem_coletivas"
      colunas={COLUNAS}
      ordem={["data", "horario"]}
      salvar={salvarColetiva}
      excluir={excluirColetiva}
      rotuloNovo="+ Aula fora da grade"
      lancarPelaGrade="coletivas"
      usaModalidades
      professores="professor_coletivas"
    />
  );
}
