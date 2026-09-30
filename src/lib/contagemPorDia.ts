import {
  carregarGrade,
  diaIso,
  vigenteEm,
  type Tipo,
} from "@/lib/fechamentoColetivas";
import { hoje, intervaloDoMes } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Contagem de coletivas/lutas agrupada por dia: para cada dia do mês, as aulas da grade daquele dia com a
// contagem lançada (ou em branco, se ainda não lançada) e as aulas lançadas fora da grade.

export type AulaDoDia = {
  id: string | null; // contagem lançada (null = aula da grade ainda sem contagem)
  horario: string;
  modalidade: string;
  professor: string | null;
  substituto: string | null;
  quantidade: number | null;
  naGrade: boolean;
};

export type DiaDeAulas = {
  data: string;
  feriado: string | null;
  previstas: number;
  lancadas: number;
  alunos: number;
  aulas: AulaDoDia[];
};

type Contagem = {
  id: string;
  data: string;
  horario: string;
  modalidade: string | null;
  professor: string | null;
  professor_substituto: string | null;
  quantidade: number;
};

const somarDias = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
const igual = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export async function diasDeAulas(
  supabase: Supabase,
  academiaId: string,
  tipo: Tipo,
  mes: string,
): Promise<DiaDeAulas[]> {
  const { inicio, fim: fimMes } = intervaloDoMes(mes);
  const dataHoje = hoje();
  const fim = fimMes < dataHoje ? fimMes : dataHoje;
  const [grade, { data: contagens }, { data: feriados }] = await Promise.all([
    carregarGrade(supabase, academiaId),
    supabase
      .from(tipo === "lutas" ? "contagem_lutas" : "contagem_coletivas")
      .select(
        "id, data, horario, modalidade, professor, professor_substituto, quantidade",
      )
      .eq("academia_id", academiaId)
      .gte("data", inicio)
      .lte("data", fimMes)
      .order("horario"),
    supabase
      .from("feriados")
      .select("data, nome, academia_id")
      .gte("data", inicio)
      .lte("data", fimMes),
  ]);
  const daGrade = grade.filter((g) => g.tipo === tipo);
  const lista = (contagens ?? []) as Contagem[];

  const dias: DiaDeAulas[] = [];
  for (let d = fim; d >= inicio; d = somarDias(d, -1)) {
    const feriado = (feriados ?? []).find(
      (f) => f.data === d && (!f.academia_id || f.academia_id === academiaId),
    );
    const doDia = lista.filter((c) => c.data === d);
    const prevista = daGrade.filter(
      (g) => g.dia_semana === diaIso(d) && vigenteEm(g, d),
    );
    if (!doDia.length && !prevista.length) continue;

    const usadas = new Set<string>();
    const aulas: AulaDoDia[] = prevista.map((g) => {
      // Coletivas: uma aula por horário; lutas: mesmo horário e modalidade (ou a que estiver livre no horário).
      const livres = doDia.filter(
        (c) =>
          !usadas.has(c.id) && c.horario.slice(0, 5) === g.horario.slice(0, 5),
      );
      const c =
        (tipo === "lutas"
          ? livres.find((x) => igual(x.modalidade, g.modalidade))
          : undefined) ?? livres[0];
      if (c) usadas.add(c.id);
      return {
        id: c?.id ?? null,
        horario: g.horario.slice(0, 5),
        modalidade: c?.modalidade ?? g.modalidade,
        professor: c ? c.professor : g.professor,
        substituto: c?.professor_substituto ?? null,
        quantidade: c ? c.quantidade : null,
        naGrade: true,
      };
    });
    for (const c of doDia.filter((x) => !usadas.has(x.id)))
      aulas.push({
        id: c.id,
        horario: c.horario.slice(0, 5),
        modalidade: c.modalidade ?? "",
        professor: c.professor,
        substituto: c.professor_substituto,
        quantidade: c.quantidade,
        naGrade: false,
      });
    aulas.sort(
      (a, b) =>
        a.horario.localeCompare(b.horario) ||
        a.modalidade.localeCompare(b.modalidade),
    );
    dias.push({
      data: d,
      feriado: (feriado?.nome as string | undefined) ?? null,
      previstas: prevista.length,
      lancadas: doDia.length,
      alunos: doDia.reduce((t, c) => t + c.quantidade, 0),
      aulas,
    });
  }
  return dias;
}
