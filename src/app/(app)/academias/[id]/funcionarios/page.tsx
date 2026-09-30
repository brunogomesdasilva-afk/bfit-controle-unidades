import Link from "next/link";
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
  { campo: "data_nascimento", rotulo: "Data de nascimento", tipo: "data", largura: "w-40" },
  { campo: "data_contratacao", rotulo: "Data de contratação", tipo: "data", largura: "w-40" },
  { campo: "ferias_limite", rotulo: "Limite para tirar férias", tipo: "data", largura: "w-44" },
  { campo: "cref", rotulo: "CREF (professores)", tipo: "texto", largura: "w-40" },
  { campo: "cref_vencimento", rotulo: "Vencimento do CREF", tipo: "data", largura: "w-40" },
  {
    campo: "ativo",
    rotulo: "Ativo",
    tipo: "opcoes",
    obrigatorio: true,
    largura: "w-28",
    opcoes: [
      { valor: "sim", rotulo: "Sim" },
      { valor: "nao", rotulo: "Não" },
    ],
  },
];

// Por padrão só os ativos; "Todos" mostra também os inativados (ex.: professor que saiu mas tem aulas lançadas).
export default async function FuncionariosPage({ params, searchParams }: PageProps<"/academias/[id]/funcionarios">) {
  const { id } = await params;
  const todos = (await searchParams).todos === "1";
  const supabase = await createClient();
  let consulta = supabase.from("funcionarios").select("*").eq("academia_id", id).order("nome");
  if (!todos) consulta = consulta.eq("ativo", true);
  const { data } = await consulta;
  const linhas: Linha[] = ((data ?? []) as Funcionario[]).map((f) => ({
    id: f.id,
    nome: f.nome,
    departamento: f.departamento,
    horario_entrada: f.horario_entrada,
    horario_saida: f.horario_saida,
    genero: f.genero,
    data_nascimento: f.data_nascimento,
    ativo: f.ativo === false ? "nao" : "sim",
    data_contratacao: f.data_contratacao,
    ferias_limite: f.ferias_limite,
    cref: f.cref,
    cref_vencimento: f.cref_vencimento,
  }));
  const filtro = (ativo: boolean, rotulo: string, href: string) => (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`border-l border-slate-300 px-3 py-1 first:border-l-0 ${ativo ? "bg-marca font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}
    >
      {rotulo}
    </Link>
  );

  return (
    <div className="max-w-6xl">
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={salvarFuncionario.bind(null, id)}
        excluir={excluirFuncionario}
        rotuloNovo="+ Novo funcionário"
        padroesNovo={{ ativo: "sim" }}
        barra={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Mostrar:</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
              {filtro(!todos, "Ativos", `/academias/${id}/funcionarios`)}
              {filtro(todos, "Todos", `/academias/${id}/funcionarios?todos=1`)}
            </div>
          </div>
        }
        vazio="Nenhum funcionário cadastrado. Clique em “+ Novo funcionário”."
      />
    </div>
  );
}
