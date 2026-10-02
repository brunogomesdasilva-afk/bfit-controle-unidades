import type { SupabaseClient } from "@supabase/supabase-js";
import type { Academia, Compra, Manutencao } from "@/lib/database.types";
import { motivosDeNaoConversao, periodos, totaisDoPeriodo, type Periodo, type Totais } from "@/lib/painel";
import { ocupacao } from "@/lib/ocupacao";
import { atrasada, carregarPendencias } from "@/lib/pendencias";
import type { createClient } from "@/lib/supabase/server";

// Todos os números do Painel de uma unidade (ou de todas) num dia de referência. Usado pela tela do Painel e
// pelo PDF do acompanhamento diário enviado por e-mail.

type Supabase = Awaited<ReturnType<typeof createClient>> | SupabaseClient;

export type Formato = "numero" | "moeda" | "percentual" | "decimal";
export type Indicador = { rotulo: string; formato: Formato; valor: (t: Totais) => number | null; sobeEBom: boolean };

export const div = (a: number | null, b: number | null) => (a !== null && b ? a / b : null);

// Linhas da tabela de indicadores (dia, mês, ano e comparações).
export const INDICADORES: Indicador[] = [
  { rotulo: "Faturamento", formato: "moeda", valor: (t) => t.faturamento, sobeEBom: true },
  { rotulo: "Visitas", formato: "numero", valor: (t) => t.visitas, sobeEBom: true },
  { rotulo: "Vendas", formato: "numero", valor: (t) => t.vendas, sobeEBom: true },
  { rotulo: "Vendas site", formato: "numero", valor: (t) => t.vendas_site, sobeEBom: true },
  { rotulo: "ICV", formato: "percentual", valor: (t) => div(t.vendas, t.visitas), sobeEBom: true },
  { rotulo: "Visitas não convertidas", formato: "numero", valor: (t) => t.nao_convertidas, sobeEBom: false },
  { rotulo: "Cancelamentos solicitados", formato: "numero", valor: (t) => t.cancelamentos_solicitados, sobeEBom: false },
  { rotulo: "Cancelamentos efetivados", formato: "numero", valor: (t) => t.cancelamentos_efetivados, sobeEBom: false },
  { rotulo: "Inadimplentes", formato: "numero", valor: (t) => t.inadimplentes, sobeEBom: false },
  { rotulo: "% inadimplência", formato: "percentual", valor: (t) => div(t.inadimplentes, t.ativos_pagantes), sobeEBom: false },
  { rotulo: "Churn", formato: "percentual", valor: (t) => div(t.cancelamentos_efetivados, t.ativos_pagantes), sobeEBom: false },
  { rotulo: "Previsão de churn", formato: "percentual", valor: (t) => div(t.cancelamentos_solicitados, t.ativos_pagantes), sobeEBom: false },
  { rotulo: "Neoassist", formato: "numero", valor: (t) => t.neoassist, sobeEBom: false },
];

export const numero = (n: number | null, casas = 0) =>
  n === null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const moeda = (n: number | null, casas = 2) =>
  n === null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (n: number | null) =>
  n === null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatar = (n: number | null, f: Formato) =>
  f === "moeda" ? moeda(n) : f === "percentual" ? pct(n) : f === "decimal" ? numero(n, 1) : numero(n);
export const formatarDia = (d: string) => d.split("-").reverse().join("/");

export type Visitantes = { passagens: number; alunos: number };
export type VisitantesPorOrigem = { unidade_origem: string; passagens: number; alunos: number };

async function visitantes(db: Supabase, unidade: string | null, p: Periodo) {
  const [total, porOrigem] = await Promise.all([
    db.rpc("visitantes_outras_unidades_total", { p_academia: unidade, inicio: p.inicio, fim: p.fim }),
    db.rpc("visitantes_outras_unidades", { p_academia: unidade, inicio: p.inicio, fim: p.fim }),
  ]);
  const t = (total.data as { passagens: number; alunos: number }[] | null)?.[0];
  return {
    total: { passagens: Number(t?.passagens ?? 0), alunos: Number(t?.alunos ?? 0) } as Visitantes,
    porOrigem: ((porOrigem.data ?? []) as VisitantesPorOrigem[]).map((o) => ({ ...o, passagens: Number(o.passagens), alunos: Number(o.alunos) })),
    disponivel: !total.error,
  };
}

// Média de alunos por professor na sala (contagens do período com professores informados) e média de alunos
// por aula coletiva.
async function medias(db: Supabase, unidade: string | null, p: Periodo) {
  let sala = db.from("contagem_sala").select("data, horario, musculacao, cardio, professores").gte("data", p.inicio).lte("data", p.fim).gt("professores", 0);
  let coletivas = db.from("contagem_coletivas").select("quantidade").gte("data", p.inicio).lte("data", p.fim);
  if (unidade) {
    sala = sala.eq("academia_id", unidade);
    coletivas = coletivas.eq("academia_id", unidade);
  }
  const lerTudo = async <T,>(q: typeof sala | typeof coletivas) => {
    const out: T[] = [];
    for (let de = 0; ; de += 1000) {
      const { data } = await q.range(de, de + 999);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return out;
    }
  };
  const [ls, lc] = await Promise.all([
    lerTudo<{ data: string; horario: string; musculacao: number; cardio: number; professores: number }>(sala),
    lerTudo<{ quantidade: number }>(coletivas),
  ]);
  const alunosSala = ls.reduce((t, r) => t + r.musculacao + r.cardio, 0);
  const professoresSala = ls.reduce((t, r) => t + r.professores, 0);
  const alunosColetivas = lc.reduce((t, r) => t + r.quantidade, 0);
  // Horário de pico: segunda a sexta, das 05:00 às 09:00 e das 18:00 às 21:00 (contagens que começam nessas
  // faixas: 05h, 06h, 07h e 08h; 18h, 19h e 20h). Só a sala (musculação + cardio) ÷ professores de sala.
  const pico = ls.filter((r) => {
    const semana = new Date(`${r.data}T12:00:00Z`).getUTCDay();
    const h = r.horario.slice(0, 5);
    return semana >= 1 && semana <= 5 && ((h >= "05:00" && h < "09:00") || (h >= "18:00" && h < "21:00"));
  });
  return {
    alunosPorProfessor: div(alunosSala, professoresSala),
    alunosPorProfessorPico: div(
      pico.reduce((t, r) => t + r.musculacao + r.cardio, 0),
      pico.reduce((t, r) => t + r.professores, 0)
    ),
    contagensPico: pico.length,
    contagensSala: ls.length,
    mediaAlunosColetiva: div(alunosColetivas, lc.length),
    aulasColetivas: lc.length,
  };
}

export type PerfilCliente = { genero: string; faixa: string; contrato: string; clientes: number };
export const FAIXAS = ["Menor de 18", "18 a 30", "31 a 40", "41 a 50", "51 ou mais", "Sem data"];
export const GENEROS_CLIENTE: Record<string, string> = { M: "Masculino", F: "Feminino" };
export const nomeGenero = (g: string) => GENEROS_CLIENTE[g] ?? "Não informado";

// Clientes ativos por gênero, faixa etária e plano (cadastro importado em Clientes).
async function perfilClientes(db: Supabase, unidade: string | null, referencia: string) {
  const { data, error } = await db.rpc("clientes_perfil", { p_academia: unidade, referencia });
  return {
    linhas: ((data ?? []) as PerfilCliente[]).map((l) => ({ ...l, clientes: Number(l.clientes) })),
    disponivel: !error,
  };
}

async function gympassPessoas(db: Supabase, unidade: string | null, p: Periodo) {
  const { data } = await db.rpc("gympass_pessoas", { p_academia: unidade, inicio: p.inicio, fim: p.fim });
  return Number(data ?? 0);
}

export async function montarPainel(
  db: Supabase,
  opcoes: { unidade: string | null; referencia: string; academias: Academia[]; sistema?: SupabaseClient }
) {
  const { unidade, referencia, academias, sistema } = opcoes;
  const p = periodos(referencia);
  const [diaMesAnterior, dia, mes, mesAnterior, ano, anoAnterior, visDia, visMes, visAno, mediasMes, ncDia, ncMes, ncAno, pendencias, ocup, clientes, gympassPessoasMes] = await Promise.all([
    totaisDoPeriodo(p.diaMesAnterior, unidade, sistema),
    totaisDoPeriodo(p.dia, unidade, sistema),
    totaisDoPeriodo(p.mes, unidade, sistema),
    totaisDoPeriodo(p.mesAnterior, unidade, sistema),
    totaisDoPeriodo(p.ano, unidade, sistema),
    totaisDoPeriodo(p.anoAnterior, unidade, sistema),
    visitantes(db, unidade, p.dia),
    visitantes(db, unidade, p.mes),
    visitantes(db, unidade, p.ano),
    medias(db, unidade, p.mes),
    motivosDeNaoConversao(db, p.dia, unidade),
    motivosDeNaoConversao(db, p.mes, unidade),
    motivosDeNaoConversao(db, p.ano, unidade),
    carregarPendencias(db as Awaited<ReturnType<typeof createClient>>, unidade),
    ocupacao(db, unidade, p.mes.inicio, p.mes.fim, referencia),
    perfilClientes(db, unidade, referencia),
    gympassPessoas(db, unidade, p.mes),
  ]);

  const escolhidas = unidade ? academias.filter((a) => a.id === unidade) : academias;
  const area = escolhidas.reduce((t, a) => t + (Number(a.area_m2) || 0), 0) || null;
  const custo = escolhidas.reduce((t, a) => t + (Number(a.custo_financeiro) || 0), 0) || null;
  const inventario = escolhidas.reduce(
    (t, a) => t + (a.maquinas_peitoral ?? 0) + (a.maquinas_costas ?? 0) + (a.maquinas_pernas ?? 0) + (a.maquinas_cardio ?? 0) + (a.maquinas_bancos_abdomen ?? 0),
    0
  );

  const compras = pendencias.compras as Compra[];
  const manutencoes = pendencias.manutencoes as Manutencao[];
  return {
    referencia,
    periodos: p,
    unidadeNome: unidade ? (academias.find((a) => a.id === unidade)?.nome ?? "") : "Todas as unidades",
    dia: dia.totais,
    diaMesAnterior: diaMesAnterior.totais,
    mes: mes.totais,
    mesAnterior: mesAnterior.totais,
    ano: ano.totais,
    anoAnterior: anoAnterior.totais,
    erro: dia.erro ?? mes.erro ?? mesAnterior.erro ?? ano.erro ?? anoAnterior.erro,
    visitantes: { dia: visDia, mes: visMes, ano: visAno },
    ocupacao: ocup,
    clientes,
    gympassPessoasMes,
    medias: mediasMes,
    naoConversao: { dia: ncDia, mes: ncMes, ano: ncAno },
    estrutura: { area, custo, inventario },
    pendencias: {
      compras,
      manutencoes,
      comprasAtrasadas: compras.filter((c) => atrasada(c)).length,
    },
  };
}

export type DadosPainel = Awaited<ReturnType<typeof montarPainel>>;
