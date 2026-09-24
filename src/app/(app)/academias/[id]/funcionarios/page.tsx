import { createClient } from "@/lib/supabase/server";
import { DEPARTAMENTOS, GENEROS, type Funcionario } from "@/lib/database.types";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirFuncionario, salvarFuncionario } from "../actions";

const lista = (opcoes: Record<string, string>) => Object.entries(opcoes).map(([valor, rotulo]) => ({ valor, rotulo }));

const COLUNAS: Coluna[] = [
  { campo: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: "min-w-56" },
  { campo: "departamento", rotulo: "Departamento", tipo: "opcoes", obrigatorio: true, largura: "w-44", opcoes: lista(DEPARTAMENTOS) },
  { campo: "horario_entrada", rotulo: "Horário de entrada", tipo: "hora", largura: "w-36" },
  { campo: "horario_saida", rotulo: "Horário de saída", tipo: "hora", largura: "w-36" },
  { campo: "genero", rotulo: "Gênero", tipo: "opcoes", largura: "w-36", opcoes: lista(GENEROS) },
];

export default async function FuncionariosPage({ params }: PageProps<"/academias/[id]/funcionarios">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("funcionarios").select("*").eq("academia_id", id).order("nome");
  const linhas: Linha[] = ((data ?? []) as Funcionario[]).map((f) => ({
    id: f.id,
    nome: f.nome,
    departamento: f.departamento,
    horario_entrada: f.horario_entrada,
    horario_saida: f.horario_saida,
    genero: f.genero,
  }));

  return (
    <div className="max-w-5xl">
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={salvarFuncionario.bind(null, id)}
        excluir={excluirFuncionario}
        rotuloNovo="+ Novo funcionário"
        vazio="Nenhum funcionário cadastrado. Clique em “+ Novo funcionário”."
      />
    </div>
  );
}
