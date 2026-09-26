// Gerador da escala de fins de semana e feriados (recepção e limpeza), respeitando a CLT:
// - interjornada mínima de 11 horas entre o fim de um dia de trabalho e o início do seguinte;
// - nunca 7 dias de trabalho seguidos (quem trabalha de segunda a sexta não pega sábado e domingo
//   do mesmo fim de semana, nem domingo e o sábado seguinte);
// - revezamento de domingos: homens no máximo 2 domingos seguidos (Lei 10.101: folga no domingo ao
//   menos 1 vez a cada 3 semanas) e mulheres no máximo 1 (CLT art. 386, revezamento quinzenal).
// Considera que recepção e limpeza trabalham de segunda a sexta (exceto feriados) no horário do cadastro.
// Entre quem pode pegar o turno, vai quem tem menos turnos de fim de semana e está há mais tempo sem pegar.

export type Setor = "recepcao" | "limpeza";
export type Turno = { inicio: string; fim: string };

export const SETORES: Record<Setor, { nome: string; sabado: Turno[]; domingoEFeriado: Turno[] }> = {
  recepcao: {
    nome: "Recepção",
    sabado: [
      { inicio: "08:00", fim: "14:00" },
      { inicio: "11:00", fim: "16:00" },
    ],
    domingoEFeriado: [{ inicio: "10:00", fim: "16:00" }],
  },
  limpeza: {
    nome: "Limpeza",
    sabado: [
      { inicio: "08:00", fim: "16:00" },
      { inicio: "08:00", fim: "16:00" },
    ],
    domingoEFeriado: [{ inicio: "10:00", fim: "16:00" }],
  },
};

export type Pessoa = {
  id: string;
  nome: string;
  setor: Setor;
  genero: "masculino" | "feminino" | null;
  entrada: string | null; // horário de entrada de segunda a sexta
  saida: string | null; // horário de saída de segunda a sexta
};
export type Feriado = { data: string; nome: string; fechada: boolean };
export type Atribuicao = { data: string; setor: Setor; inicio: string; fim: string; ordem: number; funcionarioId: string | null };

const INTERJORNADA = 11 * 60;
const MAX_DIAS_SEGUIDOS = 6;

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = domingo
export function somarDias(d: string, n: number) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

// Turnos que a unidade precisa num dia (vazio = dia útil comum ou academia fechada).
export function turnosDoDia(data: string, setor: Setor, feriados: Map<string, Feriado>): Turno[] {
  const feriado = feriados.get(data);
  if (feriado?.fechada) return [];
  if (feriado || diaDaSemana(data) === 0) return SETORES[setor].domingoEFeriado;
  if (diaDaSemana(data) === 6) return SETORES[setor].sabado;
  return [];
}

export function gerarEscala({
  inicio,
  fim,
  pessoas,
  feriados: listaFeriados,
  anteriores,
}: {
  inicio: string;
  fim: string;
  pessoas: Pessoa[];
  feriados: Feriado[];
  anteriores: Atribuicao[]; // escala já existente antes do início (para as regras na virada)
}) {
  const feriados = new Map(listaFeriados.map((f) => [f.data, f]));
  // Turnos de fim de semana/feriado de cada pessoa: data -> turno
  const escalado = new Map<string, Map<string, Turno>>(pessoas.map((p) => [p.id, new Map()]));
  const total = new Map<string, number>(pessoas.map((p) => [p.id, 0]));
  const ultimo = new Map<string, string>();
  for (const a of anteriores) {
    if (!a.funcionarioId || !escalado.has(a.funcionarioId)) continue;
    escalado.get(a.funcionarioId)!.set(a.data, { inicio: a.inicio, fim: a.fim });
    total.set(a.funcionarioId, (total.get(a.funcionarioId) ?? 0) + 1);
    if ((ultimo.get(a.funcionarioId) ?? "") < a.data) ultimo.set(a.funcionarioId, a.data);
  }

  const diaUtil = (d: string) => diaDaSemana(d) >= 1 && diaDaSemana(d) <= 5 && !feriados.has(d);
  // Jornada da pessoa num dia (turno de escala, expediente normal ou folga = null).
  function jornada(p: Pessoa, d: string): Turno | "sem-horario" | null {
    const t = escalado.get(p.id)!.get(d);
    if (t) return t;
    if (diaUtil(d)) return p.entrada && p.saida ? { inicio: p.entrada, fim: p.saida } : "sem-horario";
    return null;
  }

  function pode(p: Pessoa, d: string, turno: Turno) {
    if (escalado.get(p.id)!.has(d)) return false; // já tem turno no dia
    // Dias seguidos: conta para trás e para frente a partir do dia.
    let seguidos = 1;
    for (let x = somarDias(d, -1); jornada(p, x); x = somarDias(x, -1)) seguidos++;
    for (let x = somarDias(d, 1); jornada(p, x); x = somarDias(x, 1)) seguidos++;
    if (seguidos > MAX_DIAS_SEGUIDOS) return false;
    // Interjornada de 11h com o dia anterior e com o seguinte.
    const antes = jornada(p, somarDias(d, -1));
    if (antes && antes !== "sem-horario" && 24 * 60 - minutos(antes.fim) + minutos(turno.inicio) < INTERJORNADA) return false;
    const depois = jornada(p, somarDias(d, 1));
    if (depois && depois !== "sem-horario" && 24 * 60 - minutos(turno.fim) + minutos(depois.inicio) < INTERJORNADA) return false;
    // Revezamento de domingos.
    if (diaDaSemana(d) === 0) {
      const domingosAnteriores = [7, 14].map((n) => escalado.get(p.id)!.has(somarDias(d, -n)));
      if (p.genero === "feminino" && domingosAnteriores[0]) return false;
      if (p.genero !== "feminino" && domingosAnteriores[0] && domingosAnteriores[1]) return false;
    }
    return true;
  }

  const atribuicoes: Atribuicao[] = [];
  const avisos: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    for (const setor of Object.keys(SETORES) as Setor[]) {
      turnosDoDia(d, setor, feriados).forEach((turno, i) => {
        const candidatos = pessoas
          .filter((p) => p.setor === setor && pode(p, d, turno))
          .sort(
            (a, b) =>
              (total.get(a.id) ?? 0) - (total.get(b.id) ?? 0) ||
              (ultimo.get(a.id) ?? "").localeCompare(ultimo.get(b.id) ?? "") ||
              a.nome.localeCompare(b.nome, "pt-BR")
          );
        const escolhido = candidatos[0] ?? null;
        if (escolhido) {
          escalado.get(escolhido.id)!.set(d, turno);
          total.set(escolhido.id, (total.get(escolhido.id) ?? 0) + 1);
          ultimo.set(escolhido.id, d);
        } else {
          avisos.push(`${d.split("-").reverse().join("/")} · ${SETORES[setor].nome} ${turno.inicio}–${turno.fim}: sem pessoa disponível`);
        }
        atribuicoes.push({ data: d, setor, inicio: turno.inicio, fim: turno.fim, ordem: i + 1, funcionarioId: escolhido?.id ?? null });
      });
    }
  }
  return { atribuicoes, avisos };
}
