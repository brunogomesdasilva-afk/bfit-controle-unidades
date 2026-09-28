import Link from "next/link";
import { fechamentoColetivas, TIPOS, type Cobertura, type LinhaProfessor, type SemContagem, type Tipo } from "@/lib/fechamentoColetivas";
import { hoje, lerMes } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { SeletorMes } from "../../../AbasAcademias";
import { TabelaRelatorio, type ColunaRelatorio } from "../../../relatorios/comum";

const horas = (h: number) => (h ? h.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—");
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const soma = (l: LinhaProfessor[], c: keyof LinhaProfessor) => l.reduce((t, x) => t + Number(x[c]), 0);

function colunasProfessores(l: LinhaProfessor[]): ColunaRelatorio<LinhaProfessor>[] {
  const col = (rotulo: string, c: keyof LinhaProfessor, destaque = false): ColunaRelatorio<LinhaProfessor> => ({
    rotulo,
    valor: (x) => horas(Number(x[c])),
    total: horas(soma(l, c)),
    destaque,
  });
  return [
    { rotulo: "Professor", valor: (x) => x.professor, alinhar: "esquerda", destaque: true },
    col("Horas previstas (grade)", "previstas"),
    col("Dadas por ele", "dadas"),
    col("Cobertas por outro", "cobertoPorOutro"),
    col("Sem contagem", "semContagem"),
    col("Cobriu outros", "cobriu"),
    col("Aulas extras", "extras"),
    col("Horas a pagar", "aPagar", true),
  ];
}

const COLUNAS_COBERTURAS: ColunaRelatorio<Cobertura>[] = [
  { rotulo: "Dia", valor: (c) => dia(c.data), alinhar: "esquerda" },
  { rotulo: "Horário", valor: (c) => c.horario },
  { rotulo: "Modalidade", valor: (c) => c.modalidade, alinhar: "esquerda" },
  { rotulo: "Professor da grade", valor: (c) => c.titular, alinhar: "esquerda" },
  { rotulo: "Quem deu a aula", valor: (c) => c.quemDeu, alinhar: "esquerda", destaque: true },
  { rotulo: "Horas", valor: (c) => horas(c.horas) },
];

const COLUNAS_SEM_CONTAGEM: ColunaRelatorio<SemContagem>[] = [
  { rotulo: "Dia", valor: (c) => dia(c.data), alinhar: "esquerda" },
  { rotulo: "Horário", valor: (c) => c.horario },
  { rotulo: "Modalidade", valor: (c) => c.modalidade, alinhar: "esquerda" },
  { rotulo: "Professor da grade", valor: (c) => c.titular, alinhar: "esquerda" },
  { rotulo: "Horas", valor: (c) => horas(c.horas) },
];

// Fechamento coletivas (e lutas) do mês: horas que cada professor deveria dar pela grade × horas dadas pelas
// contagens, com as coberturas (substituições) e as aulas da grade que ficaram sem contagem.
export default async function FechamentoColetivasPage({
  params,
  searchParams,
}: PageProps<"/academias/[id]/fechamento-coletivas">) {
  const { id } = await params;
  const { mes: mesUrl } = await searchParams;
  // Padrão: o mês anterior (o último mês fechado).
  const [a, m] = hoje().split("-").map(Number);
  const mesAnterior = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const mes = typeof mesUrl === "string" ? lerMes(mesUrl) : mesAnterior;

  const supabase = await createClient();
  const f = await fechamentoColetivas(supabase, id, mes);
  const caminho = `/academias/${id}/fechamento-coletivas`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes caminho={caminho} academia={null} mes={mes} />
        <p className="text-xs text-slate-500">
          Previsto pela <Link href={`/academias/${id}/grade`} className="text-marca underline">grade de aulas</Link> de{" "}
          {dia(f.periodo.inicio)} a {dia(f.periodo.fim)}; feriados não têm aula prevista.
        </p>
      </div>

      {f.grade.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esta academia ainda não tem grade de aulas. Abra{" "}
          <Link href={`/academias/${id}/grade`} className="font-medium underline">
            Grade de aulas
          </Link>{" "}
          e monte a grade pelas contagens para calcular as horas previstas.
        </p>
      )}

      {(Object.keys(TIPOS) as Tipo[]).map((tipo) => {
        const linhas = f.professores.filter((p) => p.tipo === tipo);
        if (!linhas.length) return null;
        return (
          <section key={tipo}>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{TIPOS[tipo]} · horas por professor</h2>
            <TabelaRelatorio colunas={colunasProfessores(linhas)} linhas={linhas} chave={(x) => x.professor} vazio="" />
          </section>
        );
      })}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Coberturas (aula da grade dada por outro professor)</h2>
        <TabelaRelatorio colunas={COLUNAS_COBERTURAS} linhas={f.coberturas} chave={(c) => `${c.data}${c.horario}${c.modalidade}`} vazio="Nenhuma cobertura no mês." />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Aulas da grade sem contagem</h2>
        <p className="mb-2 text-xs text-slate-500">
          Aula não lançada ou não dada. Se a aula aconteceu, lance a contagem; se não aconteceu, ela não entra nas horas a
          pagar.
        </p>
        <TabelaRelatorio colunas={COLUNAS_SEM_CONTAGEM} linhas={f.semContagem} chave={(c) => `${c.data}${c.horario}${c.modalidade}`} vazio="Todas as aulas da grade têm contagem." />
      </section>

      <p className="text-xs text-slate-500">
        Horas a pagar = aulas da grade dadas por ele + aulas que cobriu de outros + aulas extras (lançadas fora da grade).
        Coletivas contam 30 minutos por aula e lutas 1 hora, ou a duração ajustada na grade.
      </p>
    </div>
  );
}
