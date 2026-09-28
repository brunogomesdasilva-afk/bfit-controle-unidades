import Link from "next/link";
import { carregarGrade, DIAS_SEMANA, TIPOS } from "@/lib/fechamentoColetivas";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirAulaGrade, montarGradePelasContagens, salvarAulaGrade } from "../actions";
import { BotaoMontarGrade } from "./BotaoMontarGrade";

// Grade de aulas da academia (coletivas e lutas): base do Fechamento coletivas (horas previstas).
// Guarda histórico: alterar encerra a versão anterior; "Histórico" mostra também as versões encerradas.
export default async function GradeDeAulasPage({ params, searchParams }: PageProps<"/academias/[id]/grade">) {
  const { id } = await params;
  const historico = (await searchParams).historico === "1";
  const supabase = await createClient();
  const [todas, { data: modalidades }, { data: professores }] = await Promise.all([
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
    { campo: "vigente_de", rotulo: "Vale a partir de", tipo: "data", largura: "w-40" },
    ...(historico ? [{ campo: "vigente_ate", rotulo: "Vale até", tipo: "info" as const, largura: "w-32" }] : []),
  ];
  const grade = historico ? todas : todas.filter((g) => !g.vigente_ate);
  const encerradas = todas.filter((g) => g.vigente_ate).length;
  const linhas: Linha[] = grade.map((g) => ({
    id: g.id,
    tipo: g.tipo,
    dia_semana: String(g.dia_semana),
    horario: g.horario.slice(0, 5),
    modalidade: g.modalidade,
    professor: g.professor,
    duracao_min: String(g.duracao_min),
    vigente_de: g.vigente_de,
    vigente_ate: g.vigente_ate ? g.vigente_ate.split("-").reverse().join("/") : "vigente",
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
    <div className="max-w-5xl space-y-3">
      <p className="text-sm text-slate-500">
        Aulas fixas da semana e o professor titular de cada uma. O Fechamento coletivas usa esta grade para calcular as
        horas previstas de cada professor no mês.
      </p>
      <p className="text-sm text-slate-500">
        Ao alterar uma aula, a versão anterior fica guardada e a nova vale a partir de hoje (ou da data informada em “Vale a
        partir de”); excluir encerra a aula ontem. Assim o fechamento de cada mês usa a grade que valia na época.
      </p>
      <BotaoMontarGrade montar={montarGradePelasContagens.bind(null, id)} temGrade={todas.some((g) => !g.vigente_ate)} />
      <Planilha
        colunas={colunas}
        linhas={linhas}
        salvar={salvarAulaGrade.bind(null, id)}
        excluir={excluirAulaGrade}
        rotuloNovo="+ Nova aula"
        padroesNovo={{ tipo: "coletivas", duracao_min: "30", vigente_de: hoje() }}
        barra={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Mostrar:</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
              {filtro(!historico, "Grade vigente", `/academias/${id}/grade`)}
              {filtro(historico, `Histórico (${encerradas} encerradas)`, `/academias/${id}/grade?historico=1`)}
            </div>
          </div>
        }
        vazio="Grade vazia. Clique em “Montar grade pelas contagens” ou em “+ Nova aula”."
      />
    </div>
  );
}
