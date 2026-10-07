import { DIAS_SEMANA, diaIso, fechamentoColetivas, somarDias, TIPOS, vigenteEm, type Tipo } from "@/lib/fechamentoColetivas";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Aulas do mês por professor, no formato da planilha de coletivas usada na conferência da folha:
//   - quadro por dia da semana e turno (manhã, tarde, noite): quantas vezes o dia caiu no mês (sem feriados),
//     horas por dia de cada professor e horas a serem dadas no mês;
//   - resumo por professor: horas previstas pela grade, horas que faltou (outro deu ou ficou sem contagem),
//     horas que cobriu de outros, extras, horas a pagar e, para PJ, valor da hora e total (CLT recebe na folha);
//   - coberturas (quem faltou, quem deu a aula) tiradas do campo "professor substituto" das contagens.

export type Turno = "manha" | "tarde" | "noite";
export const TURNOS: Record<Turno, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
// Manhã até 12h, tarde das 12h às 18h, noite a partir das 18h.
export const turnoDe = (horario: string): Turno => (horario < "12:00" ? "manha" : horario < "18:00" ? "tarde" : "noite");

export type AulasDoTurno = { professor: string; horasPorDia: number; horasNoMes: number };
export type LinhaDia = { dia: number; nome: string; quantidade: number; turnos: Record<Turno, AulasDoTurno[]>; total: number };

export type ResumoProfessor = {
  professor: string;
  // Funcionário do cadastro com esse nome (null: professor da grade sem cadastro em Funcionários).
  cadastro: { nome: string; pj: boolean; valorHora: number | null } | null;
  previstas: number;
  faltou: number; // aulas dele que outro deu + aulas sem contagem
  cobriu: number;
  extras: number;
  aPagar: number;
  // Só PJ (pago por fora da folha); CLT: null ("na folha").
  total: number | null;
};

export type QuadroTipo = {
  tipo: Tipo;
  nome: string;
  dias: LinhaDia[];
  totaisTurno: Record<Turno, number>;
  professores: ResumoProfessor[];
  coberturas: { data: string; horario: string; modalidade: string; titular: string; quemDeu: string; horas: number }[];
  semContagem: { data: string; horario: string; modalidade: string; titular: string; horas: number }[];
};

const chave = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const DEPARTAMENTOS_PROFESSOR = ["professores", "professor_coletivas", "professor_lutas"];

type Funcionario = { nome: string; departamento: string; pj: boolean | null; valor_hora: number | null; ativo: boolean };

// Professor da grade (às vezes só o primeiro nome) -> funcionário do cadastro: nome igual ou, se só um
// professor começar por esse nome, ele.
function acharCadastro(professor: string, funcionarios: Funcionario[]) {
  const k = chave(professor);
  const professores = funcionarios.filter((f) => DEPARTAMENTOS_PROFESSOR.includes(f.departamento));
  const exato = professores.find((f) => chave(f.nome) === k);
  if (exato) return exato;
  const comecam = professores.filter((f) => chave(f.nome).startsWith(`${k} `));
  return comecam.length === 1 ? comecam[0] : null;
}

export async function aulasDoMes(supabase: Supabase, academiaId: string, mes: string) {
  const f = await fechamentoColetivas(supabase, academiaId, mes);
  const { inicio, fim } = f.periodo;
  const [{ data: feriados }, { data: funcionarios }] = await Promise.all([
    supabase.from("feriados").select("data, nome, academia_id").gte("data", inicio).lte("data", fim).order("data"),
    supabase.from("funcionarios").select("nome, departamento, pj, valor_hora, ativo").eq("academia_id", academiaId),
  ]);
  const doMes = (feriados ?? []).filter((x) => !x.academia_id || x.academia_id === academiaId);
  const feriado = new Set(doMes.map((x) => x.data as string));
  const cadastro = (funcionarios ?? []) as Funcionario[];

  const quadros: QuadroTipo[] = [];
  for (const tipo of Object.keys(TIPOS) as Tipo[]) {
    const daGrade = f.grade.filter((g) => g.tipo === tipo);
    const professoresDoTipo = f.professores.filter((p) => p.tipo === tipo);
    if (!daGrade.length && !professoresDoTipo.length) continue;

    // Quadro por dia da semana: percorre o mês dia a dia (como o fechamento), com a grade que valia em cada dia.
    const quantidade = new Map<number, number>();
    const turnos = new Map<string, AulasDoTurno>(); // dia|turno|professor
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
      if (feriado.has(d)) continue;
      const dia = diaIso(d);
      const aulas = daGrade.filter((g) => g.dia_semana === dia && vigenteEm(g, d));
      if (!aulas.length) continue;
      quantidade.set(dia, (quantidade.get(dia) ?? 0) + 1);
      const doDia = new Map<string, number>();
      for (const g of aulas) {
        const k = `${dia}|${turnoDe(g.horario.slice(0, 5))}|${g.professor ?? "(sem professor na grade)"}`;
        doDia.set(k, (doDia.get(k) ?? 0) + g.duracao_min / 60);
      }
      for (const [k, horas] of doDia) {
        const atual = turnos.get(k) ?? { professor: k.split("|")[2], horasPorDia: 0, horasNoMes: 0 };
        atual.horasPorDia = horas; // fica a da última semana do mês (a grade mais recente)
        atual.horasNoMes += horas;
        turnos.set(k, atual);
      }
    }
    const dias: LinhaDia[] = [...quantidade.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dia, qtd]) => {
        const porTurno = (t: Turno) =>
          [...turnos.entries()].filter(([k]) => k.startsWith(`${dia}|${t}|`)).map(([, v]) => v).sort((a, b) => a.professor.localeCompare(b.professor, "pt-BR"));
        const linha = { manha: porTurno("manha"), tarde: porTurno("tarde"), noite: porTurno("noite") };
        const total = Object.values(linha).flat().reduce((t, a) => t + a.horasNoMes, 0);
        return { dia, nome: DIAS_SEMANA[dia], quantidade: qtd, turnos: linha, total };
      });
    const totaisTurno = { manha: 0, tarde: 0, noite: 0 } as Record<Turno, number>;
    for (const l of dias) for (const t of Object.keys(TURNOS) as Turno[]) totaisTurno[t] += l.turnos[t].reduce((s, a) => s + a.horasNoMes, 0);

    const professores: ResumoProfessor[] = professoresDoTipo.map((p) => {
      const c = acharCadastro(p.professor, cadastro);
      const pj = Boolean(c?.pj);
      const valorHora = c?.valor_hora === null || c?.valor_hora === undefined ? null : Number(c.valor_hora);
      return {
        professor: p.professor,
        cadastro: c ? { nome: c.nome, pj, valorHora } : null,
        previstas: p.previstas,
        faltou: p.cobertoPorOutro + p.semContagem,
        cobriu: p.cobriu,
        extras: p.extras,
        aPagar: p.aPagar,
        total: pj && valorHora !== null ? Math.round(p.aPagar * valorHora * 100) / 100 : null,
      };
    });

    quadros.push({
      tipo,
      nome: TIPOS[tipo],
      dias,
      totaisTurno,
      professores,
      coberturas: f.coberturas.filter((c) => c.tipo === tipo),
      semContagem: f.semContagem.filter((c) => c.tipo === tipo),
    });
  }

  return {
    periodo: f.periodo,
    feriados: doMes.map((x) => ({ data: x.data as string, nome: (x.nome as string | null) ?? "" })),
    temGrade: f.grade.length > 0,
    quadros,
  };
}

export type AulasDoMes = Awaited<ReturnType<typeof aulasDoMes>>;
