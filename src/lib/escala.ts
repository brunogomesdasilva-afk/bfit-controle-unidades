// Gerador da escala de fins de semana e feriados (recepção e limpeza), respeitando a CLT:
// - interjornada mínima de 11 horas entre o fim de um dia de trabalho e o início do seguinte;
// - nunca 7 dias de trabalho seguidos (quem trabalha de segunda a sexta não pega sábado e domingo
//   do mesmo fim de semana, nem domingo e o sábado seguinte);
// - revezamento de domingos: homens no máximo 2 domingos seguidos (Lei 10.101: folga no domingo ao
//   menos 1 vez a cada 3 semanas) e mulheres no máximo 1 (CLT art. 386, revezamento quinzenal).
// Considera que todos trabalham de segunda a sexta (exceto feriados) no horário do cadastro.
// Professores: entram os professores de sala e os estagiários (professores de coletivas e de lutas não). Alguns
// turnos são só de estagiário (sábado e domingo 11:00–16:00); no feriado só professores trabalham.
// Entre quem pode pegar o turno, vai quem tem menos turnos de fim de semana e está há mais tempo sem pegar.

export type Setor = "recepcao" | "limpeza" | "professores";
// papel: o turno só pode ser de quem é desse departamento (ex.: "estagiario"); sem papel, qualquer um do setor.
export type Turno = { inicio: string; fim: string; papel?: string };

export const SETORES: Record<Setor, { nome: string; departamentos: string[]; sabado: Turno[]; domingo: Turno[]; feriado: Turno[] }> = {
  recepcao: {
    nome: "Recepção",
    departamentos: ["recepcao"],
    sabado: [
      { inicio: "08:00", fim: "14:00" },
      { inicio: "11:00", fim: "16:00" },
    ],
    domingo: [{ inicio: "10:00", fim: "16:00" }],
    feriado: [{ inicio: "10:00", fim: "16:00" }],
  },
  limpeza: {
    nome: "Limpeza",
    departamentos: ["limpeza"],
    sabado: [
      { inicio: "08:00", fim: "16:00" },
      { inicio: "08:00", fim: "16:00" },
    ],
    domingo: [{ inicio: "10:00", fim: "16:00" }],
    feriado: [{ inicio: "10:00", fim: "16:00" }],
  },
  professores: {
    nome: "Professores",
    departamentos: ["professores", "estagiario"],
    sabado: [
      { inicio: "08:00", fim: "14:00", papel: "professores" },
      { inicio: "10:00", fim: "16:00", papel: "professores" },
      { inicio: "11:00", fim: "16:00", papel: "estagiario" },
    ],
    domingo: [
      { inicio: "10:00", fim: "16:00", papel: "professores" },
      { inicio: "11:00", fim: "16:00", papel: "estagiario" },
    ],
    feriado: [{ inicio: "10:00", fim: "16:00", papel: "professores" }],
  },
};

// Setor da escala de cada departamento.
export const setorDoDepartamento = (departamento: string): Setor | null =>
  (Object.keys(SETORES) as Setor[]).find((s) => SETORES[s].departamentos.includes(departamento)) ?? null;

export type Pessoa = {
  id: string;
  nome: string;
  setor: Setor;
  papel: string; // departamento (ex.: "professores" ou "estagiario" no setor Professores)
  genero: "masculino" | "feminino" | null;
  entrada: string | null; // horário de entrada de segunda a sexta
  saida: string | null; // horário de saída de segunda a sexta
};
export type Feriado = { data: string; nome: string; fechada: boolean };
export type Atribuicao = { data: string; setor: Setor; inicio: string; fim: string; ordem: number; funcionarioId: string | null };

const INTERJORNADA = 11 * 60;
const MAX_DIAS_SEGUIDOS = 6;

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
// Fim da jornada em minutos a partir do início do dia em que ela começou: expediente que termina à meia-noite
// ou depois dela (ex.: 15:30 às 00:00, 18:00 às 00:30) acaba no dia seguinte, então soma 24 horas.
const fimDaJornada = (t: Turno) => minutos(t.fim) + (minutos(t.fim) <= minutos(t.inicio) ? 24 * 60 : 0);
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = domingo
export function somarDias(d: string, n: number) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

// Turnos que a unidade precisa num dia (vazio = dia útil comum ou academia fechada).
// Dias em que as academias ficam fechadas todo ano (véspera e dia de Natal, véspera e dia de Ano Novo):
// não entram na escala, mesmo sem estarem cadastrados como feriado.
const SEMPRE_FECHADA = ["12-24", "12-25", "12-31", "01-01"];

export function turnosDoDia(data: string, setor: Setor, feriados: Map<string, Feriado>): Turno[] {
  const feriado = feriados.get(data);
  if (feriado?.fechada || SEMPRE_FECHADA.includes(data.slice(5))) return [];
  if (feriado) return SETORES[setor].feriado;
  if (diaDaSemana(data) === 0) return SETORES[setor].domingo;
  if (diaDaSemana(data) === 6) return SETORES[setor].sabado;
  return [];
}

type Entrada = {
  inicio: string;
  fim: string;
  pessoas: Pessoa[];
  feriados: Feriado[];
  anteriores: Atribuicao[]; // escala já existente fora do período (antes e depois), para as regras na virada
  indisponiveis?: { funcionarioId: string; data: string }[]; // folgas pedidas: a pessoa não entra nesse dia
  manter?: Atribuicao[]; // escala do período já gravada: mantém e só preenche os turnos vazios (com trocas)
};

// Gera a escala várias vezes (a primeira sem sorteio; as outras sorteando o desempate entre quem pode pegar cada
// turno) e fica com a melhor: menos turnos vazios e, depois, os turnos mais bem divididos entre as pessoas.
// Decidir dia a dia às vezes prende alguém que faria falta uma semana depois; as outras tentativas resolvem isso.
export function gerarEscala(entrada: Entrada) {
  const TENTATIVAS = entrada.manter ? 1 : 500;
  let semente = 20261009;
  const sorteio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  let melhor: ReturnType<typeof gerarUmaVez> | null = null;
  let melhorNota = Infinity;
  let semMelhorar = 0;
  const limite = Date.now() + 8000; // no máximo ~8 s por mês gerado
  for (let i = 0; i < TENTATIVAS && Date.now() < limite; i++) {
    const r = gerarUmaVez(entrada, i === 0 ? null : sorteio);
    const porPessoa = new Map<string, number>();
    for (const a of r.atribuicoes) if (a.funcionarioId) porPessoa.set(a.funcionarioId, (porPessoa.get(a.funcionarioId) ?? 0) + 1);
    const qtds = [...porPessoa.values()];
    const desequilibrio = qtds.length ? Math.max(...qtds) - Math.min(...qtds) : 0;
    const nota = r.avisos.length * 1000 + desequilibrio;
    if (nota < melhorNota) {
      melhor = r;
      melhorNota = nota;
      semMelhorar = 0;
    } else semMelhorar++;
    // Sem turno vazio e sem melhora há um tempo: já está bom.
    if (melhorNota < 1000 && (melhorNota <= 1 || semMelhorar >= 60)) break;
  }
  return melhor!;
}

function gerarUmaVez(
  { inicio, fim, pessoas, feriados: listaFeriados, anteriores, indisponiveis = [], manter }: Entrada,
  sorteio: (() => number) | null
) {
  const folga = new Set(indisponiveis.map((i) => `${i.funcionarioId}|${i.data}`));
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
    if (folga.has(`${p.id}|${d}`)) return false; // folga pedida para este dia
    // Dias seguidos: conta para trás e para frente a partir do dia.
    let seguidos = 1;
    for (let x = somarDias(d, -1); jornada(p, x); x = somarDias(x, -1)) seguidos++;
    for (let x = somarDias(d, 1); jornada(p, x); x = somarDias(x, 1)) seguidos++;
    if (seguidos > MAX_DIAS_SEGUIDOS) return false;
    // Interjornada de 11h com o dia anterior e com o seguinte.
    // Descanso = do fim da jornada de um dia até o início da do dia seguinte (24h depois do início do dia).
    const antes = jornada(p, somarDias(d, -1));
    if (antes && antes !== "sem-horario" && 24 * 60 + minutos(turno.inicio) - fimDaJornada(antes) < INTERJORNADA) return false;
    const depois = jornada(p, somarDias(d, 1));
    if (depois && depois !== "sem-horario" && 24 * 60 + minutos(depois.inicio) - fimDaJornada(turno) < INTERJORNADA) return false;
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
  const atribuir = (a: Atribuicao, id: string | null) => {
    if (a.funcionarioId) {
      escalado.get(a.funcionarioId)?.delete(a.data);
      total.set(a.funcionarioId, (total.get(a.funcionarioId) ?? 1) - 1);
    }
    a.funcionarioId = id;
    if (id) {
      escalado.get(id)!.set(a.data, { inicio: a.inicio, fim: a.fim });
      total.set(id, (total.get(id) ?? 0) + 1);
      if ((ultimo.get(id) ?? "") < a.data) ultimo.set(id, a.data);
    }
  };
  const servePara = (p: Pessoa, a: Atribuicao) => {
    const turno = turnosDoDia(a.data, a.setor, feriados)[a.ordem - 1];
    return p.setor === a.setor && (!turno?.papel || p.papel === turno.papel);
  };

  // Escala já existente mantida (só preenche os turnos vazios dela, com trocas se precisar).
  if (manter) {
    for (const a of manter.filter((x) => x.data >= inicio && x.data <= fim)) {
      const copia = { ...a, funcionarioId: null };
      atribuicoes.push(copia);
      if (a.funcionarioId && escalado.has(a.funcionarioId)) atribuir(copia, a.funcionarioId);
    }
  }

  for (let d = inicio; !manter && d <= fim; d = somarDias(d, 1)) {
    for (const setor of Object.keys(SETORES) as Setor[]) {
      turnosDoDia(d, setor, feriados).forEach((turno, i) => {
        // Olha a semana seguinte: evita escalar quem é uma das poucas pessoas que podem pegar um turno próximo
        // (ex.: no domingo, não usar quem é da manhã se o sábado seguinte precisa de todos os da manhã).
        const futuros: { data: string; turno: Turno }[] = [];
        for (let x = somarDias(d, 1); x <= somarDias(d, 7) && x <= fim; x = somarDias(x, 1))
          for (const t of turnosDoDia(x, setor, feriados)) futuros.push({ data: x, turno: t });
        const serve = (p: Pessoa, t: Turno) => p.setor === setor && (!t.papel || p.papel === t.papel);
        const custo = new Map<string, number>();
        const custoDe = (c: Pessoa) => {
          if (custo.has(c.id)) return custo.get(c.id)!;
          const antes = futuros.map((f) => pessoas.filter((p) => serve(p, f.turno) && pode(p, f.data, f.turno)));
          escalado.get(c.id)!.set(d, turno);
          let soma = 0;
          futuros.forEach((f, k) => {
            if (antes[k].some((p) => p.id === c.id) && !pode(c, f.data, f.turno)) soma += 1 / antes[k].length;
          });
          escalado.get(c.id)!.delete(d);
          custo.set(c.id, soma);
          return soma;
        };
        // Nas tentativas com sorteio: desempate sorteado e, às vezes, sem olhar a semana seguinte.
        const acaso = new Map(pessoas.map((p) => [p.id, sorteio ? sorteio() * 3 : 0]));
        const olhaFrente = !sorteio || sorteio() >= 0.2 ? 1 : 0;
        const candidatos = pessoas
          .filter((p) => p.setor === setor && (!turno.papel || p.papel === turno.papel) && pode(p, d, turno))
          .sort(
            (a, b) =>
              // Quem deixaria um turno próximo sem gente (custo alto) fica por último.
              (Number(custoDe(a) >= 0.5) - Number(custoDe(b) >= 0.5)) * olhaFrente ||
              (total.get(a.id) ?? 0) + acaso.get(a.id)! - ((total.get(b.id) ?? 0) + acaso.get(b.id)!) ||
              (ultimo.get(a.id) ?? "").localeCompare(ultimo.get(b.id) ?? "") ||
              a.nome.localeCompare(b.nome, "pt-BR")
          );
        const a: Atribuicao = { data: d, setor, inicio: turno.inicio, fim: turno.fim, ordem: i + 1, funcionarioId: null };
        atribuicoes.push(a);
        if (candidatos[0]) atribuir(a, candidatos[0].id);
      });
    }
  }

  // Turno vazio: tenta uma troca. Alguém que poderia pegá-lo, mas está preso por outro turno próximo (ex.: pegou o
  // domingo e não pode o sábado seguinte por causa dos 7 dias seguidos), passa esse outro turno para um colega.
  const trocas: string[] = [];
  for (const vazio of atribuicoes.filter((a) => !a.funcionarioId)) {
    const turnoVazio = { inicio: vazio.inicio, fim: vazio.fim };
    let resolvido = false;
    for (const p of pessoas.filter((x) => servePara(x, vazio) && !folga.has(`${x.id}|${vazio.data}`))) {
      const proximos = atribuicoes.filter(
        (a) => a.funcionarioId === p.id && a !== vazio && a.data >= somarDias(vazio.data, -8) && a.data <= somarDias(vazio.data, 8) && a.data >= inicio && a.data <= fim
      );
      for (const outro of proximos) {
        atribuir(outro, null);
        if (pode(p, vazio.data, turnoVazio)) {
          atribuir(vazio, p.id);
          const turnoOutro = { inicio: outro.inicio, fim: outro.fim };
          const colega = pessoas
            .filter((q) => q.id !== p.id && servePara(q, outro) && pode(q, outro.data, turnoOutro))
            .sort((a, b) => (total.get(a.id) ?? 0) - (total.get(b.id) ?? 0))[0];
          if (colega) {
            atribuir(outro, colega.id);
            trocas.push(`${outro.data.split("-").reverse().join("/")}: ${p.nome.split(" ")[0]} passou o turno para ${colega.nome.split(" ")[0]}`);
            resolvido = true;
            break;
          }
          atribuir(vazio, null);
        }
        atribuir(outro, p.id); // desfaz
      }
      if (resolvido) break;
    }
  }

  // O que ainda ficou vazio: aviso com o motivo de cada pessoa do setor não poder pegar.
  for (const a of atribuicoes.filter((x) => !x.funcionarioId)) {
    const turno = turnosDoDia(a.data, a.setor, feriados)[a.ordem - 1] ?? { inicio: a.inicio, fim: a.fim };
    const motivos = pessoas.filter((p) => servePara(p, a)).map((p) => `${p.nome.split(" ")[0]}: ${motivo(p, a.data, turno)}`);
    avisos.push(
      `${a.data.split("-").reverse().join("/")} · ${SETORES[a.setor].nome} ${a.inicio}–${a.fim}${turno.papel === "estagiario" ? " (estagiário)" : ""}: sem pessoa disponível${motivos.length ? ` (${motivos.join("; ")})` : " (ninguém cadastrado para esse turno)"}`
    );
  }
  return { atribuicoes, avisos, trocas };

  // Por que a pessoa não pode pegar o turno (para o aviso).
  function motivo(p: Pessoa, d: string, turno: Turno) {
    if (escalado.get(p.id)!.has(d)) return "já tem turno no dia";
    if (folga.has(`${p.id}|${d}`)) return "folga pedida";
    const antes = jornada(p, somarDias(d, -1));
    if (antes && antes !== "sem-horario" && 24 * 60 + minutos(turno.inicio) - fimDaJornada(antes) < INTERJORNADA) return `não descansa 11h depois do dia anterior (sai ${antes.fim})`;
    const depois = jornada(p, somarDias(d, 1));
    if (depois && depois !== "sem-horario" && 24 * 60 + minutos(depois.inicio) - fimDaJornada(turno) < INTERJORNADA) return `não descansa 11h antes do dia seguinte (entra ${depois.inicio})`;
    if (diaDaSemana(d) === 0 && escalado.get(p.id)!.has(somarDias(d, -7))) return p.genero === "feminino" ? "trabalhou o domingo anterior" : "trabalhou os 2 domingos anteriores";
    return "seria o 7º dia seguido";
  }
}
