import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { totaisPorAcademia, type TotaisAcademia } from "@/lib/relatorios";

// Números do Painel: períodos de comparação (dia, mês, mês anterior, ano, ano anterior), totais
// somados das unidades escolhidas, séries mensais para os gráficos e motivos de não conversão.

type Supabase = Awaited<ReturnType<typeof createClient>> | SupabaseClient;

const dois = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dois(m)}-${dois(d)}`;
const ultimoDiaDoMes = (a: number, m: number) => new Date(a, m, 0).getDate();

export type Periodo = { inicio: string; fim: string };

// Períodos equivalentes: o mês até o dia de referência e o mesmo trecho do mês anterior; o ano até o
// dia de referência e o mesmo trecho do ano anterior.
export function periodos(referencia: string) {
  const [a, m, d] = referencia.split("-").map(Number);
  const mesAnt = m === 1 ? { a: a - 1, m: 12 } : { a, m: m - 1 };
  return {
    dia: { inicio: referencia, fim: referencia },
    mes: { inicio: iso(a, m, 1), fim: referencia },
    mesAnterior: { inicio: iso(mesAnt.a, mesAnt.m, 1), fim: iso(mesAnt.a, mesAnt.m, Math.min(d, ultimoDiaDoMes(mesAnt.a, mesAnt.m))) },
    // O mesmo dia no mês anterior (ou o último dia dele, se o mês anterior for mais curto).
    diaMesAnterior: {
      inicio: iso(mesAnt.a, mesAnt.m, Math.min(d, ultimoDiaDoMes(mesAnt.a, mesAnt.m))),
      fim: iso(mesAnt.a, mesAnt.m, Math.min(d, ultimoDiaDoMes(mesAnt.a, mesAnt.m))),
    },
    ano: { inicio: iso(a, 1, 1), fim: referencia },
    anoAnterior: { inicio: iso(a - 1, 1, 1), fim: iso(a - 1, m, Math.min(d, ultimoDiaDoMes(a - 1, m))) },
  };
}

export type Totais = {
  visitas: number;
  vendas: number;
  vendas_site: number;
  faturamento: number;
  cancelamentos_solicitados: number;
  cancelamentos_efetivados: number;
  ativos_pagantes: number | null;
  inadimplentes: number | null;
  nps: number | null;
  nao_convertidas: number;
  passagens: number;
  gympass: number;
  gympass_valor: number;
  contagem_sala: number;
  alunos_coletivas: number;
  alunos_lutas: number;
  dias_lancados: number;
  neoassist: number;
};

// Soma as unidades escolhidas. Ativos e inadimplentes: soma do último valor lançado de cada unidade.
function somar(linhas: TotaisAcademia[]): Totais {
  const s = (c: keyof TotaisAcademia) => linhas.reduce((t, l) => t + (Number(l[c]) || 0), 0);
  const algum = (c: keyof TotaisAcademia) => (linhas.some((l) => l[c] !== null && l[c] !== undefined) ? s(c) : null);
  const nps = linhas.map((l) => l.nps).filter((n): n is number => n !== null);
  return {
    visitas: s("visitas"),
    vendas: s("vendas"),
    vendas_site: s("vendas_site"),
    faturamento: s("faturamento"),
    cancelamentos_solicitados: s("cancelamentos_solicitados"),
    cancelamentos_efetivados: s("cancelamentos_efetivados"),
    ativos_pagantes: algum("ativos_pagantes"),
    inadimplentes: algum("inadimplentes"),
    nps: nps.length ? nps.reduce((a, b) => a + b, 0) / nps.length : null,
    nao_convertidas: s("nao_convertidas"),
    passagens: s("passagens"),
    gympass: s("gympass"),
    gympass_valor: s("gympass_valor"),
    contagem_sala: s("contagem_sala"),
    alunos_coletivas: s("alunos_coletivas"),
    alunos_lutas: s("alunos_lutas"),
    dias_lancados: Math.max(0, ...linhas.map((l) => Number(l.dias_lancados) || 0)),
    neoassist: 0,
  };
}

export async function totaisDoPeriodo(p: Periodo, unidade: string | null, sistema?: SupabaseClient) {
  const supabase = sistema ?? (await createClient());
  const [{ linhas, erro }, neoassist] = await Promise.all([
    totaisPorAcademia(p.inicio, p.fim, sistema),
    // Neoassist não vem na função do banco: soma direto do controle diário.
    todas<{ neoassist: number | null }>((de, ate) => {
      let q = supabase.from("controle_diario").select("neoassist").gte("data", p.inicio).lte("data", p.fim).range(de, ate);
      if (unidade) q = q.eq("academia_id", unidade);
      return q;
    }),
  ]);
  const totais = somar(unidade ? linhas.filter((l) => l.academia_id === unidade) : linhas);
  totais.neoassist = neoassist.reduce((t, l) => t + (Number(l.neoassist) || 0), 0);
  return { totais, erro };
}

// Busca todas as linhas de uma consulta, de mil em mil (o banco devolve no máximo mil por vez).
async function todas<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>) {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await montar(de, de + 999);
    saida.push(...(data ?? []));
    if (!data || data.length < 1000) return saida;
  }
}

// Séries mensais (jan-dez) do ano de referência e do anterior: faturamento (soma do mês) e ativos
// pagantes (último valor lançado no mês, somando as unidades).
export async function seriesMensais(supabase: Supabase, referencia: string, unidade: string | null) {
  const ano = Number(referencia.slice(0, 4));
  const linhas = await todas<{ academia_id: string; data: string; faturamento: number | null; ativos_pagantes: number | null }>(
    (de, ate) => {
      let q = supabase
        .from("controle_diario")
        .select("academia_id, data, faturamento, ativos_pagantes")
        .gte("data", `${ano - 1}-01-01`)
        .lte("data", referencia)
        .order("data")
        .range(de, ate);
      if (unidade) q = q.eq("academia_id", unidade);
      return q;
    }
  );

  const vazio = () => Array.from({ length: 12 }, () => null as number | null);
  const faturamento = { atual: vazio(), anterior: vazio() };
  const ativosPorUnidade = { atual: new Map<string, number>(), anterior: new Map<string, number>() };
  for (const l of linhas) {
    const a = Number(l.data.slice(0, 4));
    const m = Number(l.data.slice(5, 7)) - 1;
    const serie = a === ano ? "atual" : "anterior";
    if (l.faturamento !== null) faturamento[serie][m] = (faturamento[serie][m] ?? 0) + Number(l.faturamento);
    // Linhas em ordem de data: o último valor do mês de cada unidade sobrescreve os anteriores.
    if (l.ativos_pagantes !== null) ativosPorUnidade[serie].set(`${m}|${l.academia_id}`, Number(l.ativos_pagantes));
  }
  const ativos = { atual: vazio(), anterior: vazio() };
  for (const serie of ["atual", "anterior"] as const)
    for (const [chave, valor] of ativosPorUnidade[serie]) {
      const m = Number(chave.split("|")[0]);
      ativos[serie][m] = (ativos[serie][m] ?? 0) + valor;
    }
  return { ano, faturamento, ativos };
}

// Motivos de não conversão mais frequentes num período (os demais somados em "Outros").
export async function motivosDeNaoConversao(supabase: Supabase, p: Periodo, unidade: string | null, limite = 7) {
  const linhas = await todas<{ motivo: string | null }>((de, ate) => {
    let q = supabase.from("controle_conversao").select("motivo").gte("data", p.inicio).lte("data", p.fim).range(de, ate);
    if (unidade) q = q.eq("academia_id", unidade);
    return q;
  });
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    const motivo = (l.motivo ?? "").trim().toUpperCase() || "SEM MOTIVO INFORMADO";
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
  }
  const ordenados = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  const principais = ordenados.slice(0, limite);
  const outros = ordenados.slice(limite).reduce((t, [, n]) => t + n, 0);
  if (outros) principais.push(["OUTROS", outros]);
  return { motivos: principais, total: linhas.length };
}

// Último dia com controle diário lançado (até hoje), para o Painel abrir num dia com dados.
export async function ultimoDiaLancado(supabase: Supabase, unidade: string | null, ate: string) {
  let q = supabase.from("controle_diario").select("data").lte("data", ate).order("data", { ascending: false }).limit(1);
  if (unidade) q = q.eq("academia_id", unidade);
  const { data } = await q;
  return (data?.[0]?.data as string | undefined) ?? null;
}
