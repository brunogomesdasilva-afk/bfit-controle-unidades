import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { COM_CREF, DEPARTAMENTOS, GENEROS, type Funcionario } from "@/lib/database.types";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirFuncionario, salvarFuncionario } from "../actions";

const lista = (opcoes: Record<string, string>) => Object.entries(opcoes).map(([valor, rotulo]) => ({ valor, rotulo }));

// Colunas de cada departamento: CREF só nos professores de sala e de coletivas. O departamento continua
// editável (para mudar a pessoa de departamento), mas já vem preenchido no bloco em que ela é incluída.
function colunas(departamento: string): Coluna[] {
  return [
    { campo: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: "min-w-64" },
    { campo: "departamento", rotulo: "Departamento", tipo: "opcoes", obrigatorio: true, largura: "w-48", opcoes: lista(DEPARTAMENTOS) },
    { campo: "horario_entrada", rotulo: "Entrada", tipo: "hora", largura: "w-32" },
    { campo: "horario_saida", rotulo: "Saída", tipo: "hora", largura: "w-32" },
    { campo: "genero", rotulo: "Gênero", tipo: "opcoes", largura: "w-36", opcoes: lista(GENEROS) },
    { campo: "data_nascimento", rotulo: "Nascimento", tipo: "data", largura: "w-40" },
    { campo: "data_contratacao", rotulo: "Contratação", tipo: "data", largura: "w-40" },
    { campo: "ferias_limite", rotulo: "Limite das férias", tipo: "data", largura: "w-40" },
    ...(COM_CREF.includes(departamento)
      ? ([
          { campo: "cref", rotulo: "CREF", tipo: "texto", largura: "w-40" },
          { campo: "cref_vencimento", rotulo: "Vencimento do CREF", tipo: "data", largura: "w-44" },
        ] as Coluna[])
      : []),
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
}

// Funcionários da academia, um bloco por departamento. Por padrão só os ativos; "Todos" mostra também os
// inativados (ex.: professor que saiu mas tem aulas lançadas).
export default async function FuncionariosPage({ params, searchParams }: PageProps<"/academias/[id]/funcionarios">) {
  const { id } = await params;
  const todos = (await searchParams).todos === "1";
  const supabase = await createClient();
  let consulta = supabase.from("funcionarios").select("*").eq("academia_id", id).order("nome");
  if (!todos) consulta = consulta.eq("ativo", true);
  const { data } = await consulta;
  const funcionarios = (data ?? []) as Funcionario[];
  const paraLinha = (f: Funcionario): Linha => ({
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
  });
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
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {funcionarios.length} {funcionarios.length === 1 ? "funcionário" : "funcionários"}
          {todos ? " (ativos e inativos)" : " ativos"}. Dê dois cliques na linha para alterar.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Mostrar:</span>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
            {filtro(!todos, "Ativos", `/academias/${id}/funcionarios`)}
            {filtro(todos, "Todos", `/academias/${id}/funcionarios?todos=1`)}
          </div>
        </div>
      </div>

      {(Object.entries(DEPARTAMENTOS) as [string, string][]).map(([departamento, nome]) => {
        const doDepartamento = funcionarios.filter((f) => f.departamento === departamento);
        return (
          <details key={departamento} open className="group rounded-lg border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
              <span className="text-slate-400 transition group-open:rotate-90">›</span>
              <span className="text-base font-semibold text-slate-900">{nome}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{doDepartamento.length}</span>
            </summary>
            <div className="border-t border-slate-100 p-3">
              <Planilha
                colunas={colunas(departamento)}
                linhas={doDepartamento.map(paraLinha)}
                salvar={salvarFuncionario.bind(null, id)}
                excluir={excluirFuncionario}
                rotuloNovo={`+ Novo em ${nome}`}
                padroesNovo={{ ativo: "sim", departamento }}
                vazio={`Nenhum funcionário em ${nome}.`}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
