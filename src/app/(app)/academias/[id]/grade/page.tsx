import { carregarGrade, DIAS_SEMANA, TIPOS } from "@/lib/fechamentoColetivas";
import { createClient } from "@/lib/supabase/server";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirAulaGrade, montarGradePelasContagens, salvarAulaGrade } from "../actions";
import { BotaoMontarGrade } from "./BotaoMontarGrade";

// Grade de aulas da academia (coletivas e lutas): base do Fechamento coletivas (horas previstas).
export default async function GradeDeAulasPage({ params }: PageProps<"/academias/[id]/grade">) {
  const { id } = await params;
  const supabase = await createClient();
  const [grade, { data: modalidades }, { data: professores }] = await Promise.all([
    carregarGrade(supabase, id),
    supabase.from("modalidades").select("nome").eq("academia_id", id).order("nome"),
    supabase
      .from("funcionarios")
      .select("nome")
      .eq("academia_id", id)
      .eq("ativo", true)
      .in("departamento", ["professor_coletivas", "professor_lutas"])
      .order("nome"),
  ]);

  const colunas: Coluna[] = [
    {
      campo: "tipo",
      rotulo: "Tipo",
      tipo: "opcoes",
      obrigatorio: true,
      largura: "w-32",
      opcoes: Object.entries(TIPOS).map(([valor, rotulo]) => ({ valor, rotulo })),
    },
    {
      campo: "dia_semana",
      rotulo: "Dia da semana",
      tipo: "opcoes",
      obrigatorio: true,
      largura: "w-36",
      opcoes: DIAS_SEMANA.slice(1).map((rotulo, i) => ({ valor: String(i + 1), rotulo })),
    },
    { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true, largura: "w-28" },
    {
      campo: "modalidade",
      rotulo: "Modalidade",
      tipo: "opcoes",
      obrigatorio: true,
      largura: "min-w-44",
      opcoes: (modalidades ?? []).map((m) => ({ valor: m.nome as string, rotulo: m.nome as string })),
    },
    {
      campo: "professor",
      rotulo: "Professor titular",
      tipo: "opcoes",
      largura: "min-w-44",
      opcoes: [...new Set((professores ?? []).map((p) => p.nome as string))].map((n) => ({ valor: n, rotulo: n })),
    },
    { campo: "duracao_min", rotulo: "Duração (min)", tipo: "inteiro", obrigatorio: true, largura: "w-32" },
  ];
  const linhas: Linha[] = grade.map((g) => ({
    id: g.id,
    tipo: g.tipo,
    dia_semana: String(g.dia_semana),
    horario: g.horario.slice(0, 5),
    modalidade: g.modalidade,
    professor: g.professor,
    duracao_min: String(g.duracao_min),
  }));

  return (
    <div className="max-w-5xl space-y-3">
      <p className="text-sm text-slate-500">
        Aulas fixas da semana e o professor titular de cada uma. O Fechamento coletivas usa esta grade para calcular as
        horas previstas de cada professor no mês.
      </p>
      <BotaoMontarGrade montar={montarGradePelasContagens.bind(null, id)} temGrade={grade.length > 0} />
      <Planilha
        colunas={colunas}
        linhas={linhas}
        salvar={salvarAulaGrade.bind(null, id)}
        excluir={excluirAulaGrade}
        rotuloNovo="+ Nova aula"
        padroesNovo={{ tipo: "coletivas", duracao_min: "30" }}
        vazio="Grade vazia. Clique em “Montar grade pelas contagens” ou em “+ Nova aula”."
      />
    </div>
  );
}
