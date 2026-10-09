// Aula repetida em sequência na grade (mesma modalidade e professor, a segunda começando quando a primeira
// termina, ex.: FIT DANCE 20:00 e 20:30 de 30 min) é uma aula só, com uma contagem só: vira 20:00 com 60 min.

type AulaBase = { dia_semana: number; horario: string; modalidade: string; professor: string | null; duracao_min: number };

const mesmo = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

// A aula "b" continua a aula "a"?
export function continua(a: AulaBase, b: AulaBase) {
  return a.dia_semana === b.dia_semana && mesmo(a.modalidade, b.modalidade) && mesmo(a.professor, b.professor) && minutos(a.horario) + a.duracao_min === minutos(b.horario);
}

// Junta as sequências de uma lista de aulas (de um mesmo tipo e versão da grade). Devolve as aulas que ficam
// (com a duração somada) e, para cada aula juntada, a aula que a absorveu.
export function juntarSequencias<T extends AulaBase>(aulas: T[]) {
  const ordenadas = [...aulas].sort((a, b) => a.dia_semana - b.dia_semana || minutos(a.horario) - minutos(b.horario));
  const ficam: T[] = [];
  const juntadas: { aula: T; em: T }[] = [];
  for (const aula of ordenadas) {
    const anterior = ficam[ficam.length - 1];
    if (anterior && continua(anterior, aula)) {
      juntadas.push({ aula, em: anterior });
      anterior.duracao_min += aula.duracao_min;
    } else ficam.push({ ...aula });
  }
  // "em" é a própria aula de "ficam" (já com a duração final).
  return { ficam, juntadas };
}
