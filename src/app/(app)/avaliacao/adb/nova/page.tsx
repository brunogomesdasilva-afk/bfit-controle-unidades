import Link from "next/link";
import { NOTAS, periodoDoHorario, QUESTIONARIOS, questionarioDoDepartamento, type Avaliacao } from "@/lib/adb";
import { contextoAcademias } from "@/lib/contexto";
import { DEPARTAMENTOS, type Funcionario } from "@/lib/database.types";
import { hoje } from "@/lib/planilha";
import { salvarAvaliacao } from "../actions";
import { FormularioAdb } from "../FormularioAdb";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Nova A.D.B (ou atualização da do mês, se o funcionário já foi avaliado). Sempre no mês atual.
export default async function NovaAvaliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string; funcionario?: string }>;
}) {
  const params = await searchParams;
  const { supabase, academias, selecionada } = await contextoAcademias(params.academia);
  const voltarPara = selecionada ? `/avaliacao/adb?academia=${selecionada}` : "/avaliacao/adb";

  if (!selecionada) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Nova avaliação (A.D.B)</h1>
        <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Abra a aba da academia na tela da A.D.B para incluir uma avaliação.{" "}
          <Link href="/avaliacao/adb" className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  // Só entram os funcionários que têm questionário (professores e recepção).
  const { data } = await supabase.from("funcionarios").select("*").eq("academia_id", selecionada).order("nome");
  const funcionarios = ((data ?? []) as Funcionario[]).filter((f) => questionarioDoDepartamento(f.departamento));
  const escolhido = funcionarios.find((f) => f.id === params.funcionario) ?? null;
  const questionario = escolhido ? questionarioDoDepartamento(escolhido.departamento) : null;

  const mes = `${hoje().slice(0, 7)}-01`;
  const { data: existente } = escolhido
    ? await supabase.from("avaliacoes_adb").select("*").eq("funcionario_id", escolhido.id).eq("mes", mes).maybeSingle()
    : { data: null };
  const avaliacao = existente as Avaliacao | null;

  const perguntas = questionario ? QUESTIONARIOS[questionario].perguntas : [];
  const nomeAcademia = academias.find((a) => a.id === selecionada)?.nome;

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">Avaliação de desempenho · {nomeAcademia}</p>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">
        {avaliacao ? "Atualizar avaliação (A.D.B)" : "Nova avaliação (A.D.B)"}
      </h1>
      <FormularioAdb
        // Troca de funcionário recria o formulário com as notas dele.
        key={escolhido?.id ?? "nenhum"}
        funcionarios={funcionarios.map((f) => ({
          id: f.id,
          nome: f.nome,
          cargo: DEPARTAMENTOS[f.departamento],
          periodo: periodoDoHorario(f.horario_entrada),
        }))}
        funcionarioId={escolhido?.id ?? null}
        perguntas={perguntas}
        nomeQuestionario={questionario ? QUESTIONARIOS[questionario].nome : null}
        mesDescricao={`${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`}
        inicial={{
          notas: NOTAS.map((c) => (avaliacao ? avaliacao[c] : null)),
          stop: avaliacao?.stop ?? "",
          start: avaliacao?.start ?? "",
          continuar: avaliacao?.continuar ?? "",
          jaAvaliado: Boolean(avaliacao),
        }}
        salvar={salvarAvaliacao.bind(null, selecionada)}
        voltarPara={voltarPara}
        caminhoDoFormulario={`/avaliacao/adb/nova?academia=${selecionada}`}
      />
    </div>
  );
}
