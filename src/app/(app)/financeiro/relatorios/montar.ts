import type { createClient } from "@/lib/supabase/server";
import { nomePessoa } from "@/lib/financeiro";

// Relatórios do Financeiro (a mesma montagem serve a tela e o Excel).

type Supabase = Awaited<ReturnType<typeof createClient>>;
export const RELATORIOS = {
  fluxo_pagamentos: "Fluxo de pagamentos (conferência)",
  pagar_aberto: "Contas a pagar em aberto",
  receber_aberto: "Contas a receber em aberto",
  pagamentos: "Pagamentos realizados",
  recebimentos: "Recebimentos realizados",
  fluxo: "Fluxo de caixa por categoria (realizado)",
  previsto: "Fluxo de caixa previsto (em aberto)",
} as const;
export type Relatorio = keyof typeof RELATORIOS;
export type Celula = string | number | null;
export type Tabela = { colunas: { rotulo: string; tipo: "texto" | "data" | "moeda" }[]; linhas: Celula[][]; totais?: Celula[]; nota?: string };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>) {
  const lista: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await consulta(de, de + 999);
    lista.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return lista;
}

export async function montarRelatorio(supabase: Supabase, rel: Relatorio, f: { academia: string | null; de: string; ate: string; academias: { id: string; nome: string }[] }): Promise<Tabela> {
  const [{ data: pessoas }, { data: categorias }, { data: contas }] = await Promise.all([
    supabase.from("fin_pessoas").select("id, razao_social, nome_fantasia"),
    supabase.from("fin_categorias").select("id, nome, fin_grupos(nome)"),
    supabase.from("fin_contas").select("id, nome"),
  ]);
  const pessoa = new Map((pessoas ?? []).map((p) => [p.id, nomePessoa(p)]));
  const categoria = new Map((categorias ?? []).map((c) => [c.id, { nome: c.nome as string, grupo: (c.fin_grupos as unknown as { nome: string } | null)?.nome ?? "Sem grupo" }]));
  const conta = new Map((contas ?? []).map((c) => [c.id, c.nome]));
  const academia = new Map(f.academias.map((a) => [a.id, a.nome]));
  const comAcademia = !f.academia;

  // No formato da planilha do fluxo usada na conferência de pagamentos: um título por linha, pela data de
  // pagamento (previsão), com o valor negativo (a pagar). Cancelados ficam de fora.
  if (rel === "fluxo_pagamentos") {
    const titulos = await tudo((de, ate) => {
      let q = supabase
        .from("fin_titulos_situacao")
        .select("academia_id, pessoa_id, categoria_id, conta_id, previsao, vencimento, documento, descricao, parcela, parcelas, valor, saldo, situacao")
        .eq("tipo", "pagar")
        .neq("situacao", "cancelado")
        .gte("previsao", f.de)
        .lte("previsao", f.ate)
        .order("previsao")
        .range(de, ate);
      if (f.academia) q = q.eq("academia_id", f.academia);
      return q;
    });
    const razao = new Map((pessoas ?? []).map((p) => [p.id, p.razao_social as string]));
    const ordenados = titulos.sort((a, b) => (a.previsao ?? a.vencimento).localeCompare(b.previsao ?? b.vencimento) || (razao.get(a.pessoa_id) ?? "").localeCompare(razao.get(b.pessoa_id) ?? ""));
    const situacao: Record<string, string> = { aberto: "a pagar", vencido: "vencido", parcial: "pago em parte", liquidado: "pago" };
    const porConta = new Map<string, number>();
    for (const x of ordenados) porConta.set(conta.get(x.conta_id) ?? "Sem conta", (porConta.get(conta.get(x.conta_id) ?? "Sem conta") ?? 0) - Number(x.valor));
    return {
      colunas: [
        { rotulo: "Data de previsão", tipo: "data" },
        { rotulo: "Cliente ou Fornecedor (Razão Social)", tipo: "texto" },
        { rotulo: "Categoria", tipo: "texto" },
        { rotulo: "Parcela", tipo: "texto" },
        { rotulo: "Conta corrente", tipo: "texto" },
        { rotulo: "Projeto", tipo: "texto" },
        { rotulo: "NF", tipo: "texto" },
        { rotulo: "A pagar", tipo: "moeda" },
        { rotulo: "Situação", tipo: "texto" },
      ],
      linhas: ordenados.map((x) => [
        x.previsao ?? x.vencimento,
        razao.get(x.pessoa_id) ?? "",
        categoria.get(x.categoria_id)?.nome ?? "",
        `${String(x.parcela).padStart(3, "0")}/${String(x.parcelas).padStart(3, "0")}`,
        conta.get(x.conta_id) ?? "",
        academia.get(x.academia_id) ?? "",
        x.documento ?? "",
        -Number(x.valor),
        situacao[x.situacao] ?? x.situacao,
      ]),
      totais: ["", "", "", "", "", "", "Total", -sum(ordenados, "valor"), ""],
      nota: `Títulos a pagar com data de pagamento (previsão) de ${f.de.split("-").reverse().join("/")} a ${f.ate.split("-").reverse().join("/")}. Por conta: ${[...porConta].map(([c, v]) => `${c} ${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join(" · ") || "—"}.`,
    };
  }

  if (rel === "pagar_aberto" || rel === "receber_aberto") {
    const titulos = await tudo((de, ate) => {
      let q = supabase
        .from("fin_titulos_situacao")
        .select("academia_id, pessoa_id, categoria_id, vencimento, previsao, documento, descricao, parcela, parcelas, valor, baixado, saldo, situacao")
        .eq("tipo", rel === "pagar_aberto" ? "pagar" : "receber")
        .in("situacao", ["aberto", "vencido", "parcial"])
        .lte("vencimento", f.ate)
        .order("vencimento")
        .range(de, ate);
      if (f.academia) q = q.eq("academia_id", f.academia);
      return q;
    });
    return {
      colunas: [
        { rotulo: "Vencimento", tipo: "data" },
        ...(comAcademia ? [{ rotulo: "Academia", tipo: "texto" as const }] : []),
        { rotulo: rel === "pagar_aberto" ? "Fornecedor" : "Cliente", tipo: "texto" },
        { rotulo: "Descrição / NF", tipo: "texto" },
        { rotulo: "Categoria", tipo: "texto" },
        { rotulo: "Parcela", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
        { rotulo: "Já baixado", tipo: "moeda" },
        { rotulo: "Saldo", tipo: "moeda" },
      ],
      linhas: titulos.map((t) => [
        t.vencimento,
        ...(comAcademia ? [academia.get(t.academia_id) ?? ""] : []),
        pessoa.get(t.pessoa_id) ?? "",
        [t.descricao, t.documento && `NF ${t.documento}`].filter(Boolean).join(" · "),
        categoria.get(t.categoria_id)?.nome ?? "",
        t.parcelas > 1 ? `${t.parcela}/${t.parcelas}` : "",
        Number(t.valor),
        Number(t.baixado),
        Number(t.saldo),
      ]),
      totais: ["Total", ...(comAcademia ? [""] : []), "", "", "", "", sum(titulos, "valor"), sum(titulos, "baixado"), sum(titulos, "saldo")],
      nota: `Títulos com vencimento até ${f.ate.split("-").reverse().join("/")} (inclui os vencidos).`,
    };
  }

  if (rel === "pagamentos" || rel === "recebimentos") {
    const baixas = await tudo((de, ate) =>
      supabase
        .from("fin_baixas")
        .select("data, valor, juros, multa, desconto, forma, conta_id, titulo:fin_titulos!inner(tipo, academia_id, pessoa_id, categoria_id, documento, descricao, parcela, parcelas)")
        .eq("titulo.tipo", rel === "pagamentos" ? "pagar" : "receber")
        .gte("data", f.de)
        .lte("data", f.ate)
        .order("data")
        .range(de, ate)
    );
    const lista = baixas
      .map((b) => ({ ...b, titulo: b.titulo as unknown as { academia_id: string; pessoa_id: string; categoria_id: string; documento: string | null; descricao: string | null; parcela: number; parcelas: number } }))
      .filter((b) => !f.academia || b.titulo.academia_id === f.academia);
    return {
      colunas: [
        { rotulo: "Data", tipo: "data" },
        ...(comAcademia ? [{ rotulo: "Academia", tipo: "texto" as const }] : []),
        { rotulo: rel === "pagamentos" ? "Fornecedor" : "Cliente", tipo: "texto" },
        { rotulo: "Descrição / NF", tipo: "texto" },
        { rotulo: "Categoria", tipo: "texto" },
        { rotulo: "Conta / forma", tipo: "texto" },
        { rotulo: "Principal", tipo: "moeda" },
        { rotulo: "Juros + multa", tipo: "moeda" },
        { rotulo: "Desconto", tipo: "moeda" },
        { rotulo: rel === "pagamentos" ? "Total pago" : "Total recebido", tipo: "moeda" },
      ],
      linhas: lista.map((b) => [
        b.data,
        ...(comAcademia ? [academia.get(b.titulo.academia_id) ?? ""] : []),
        pessoa.get(b.titulo.pessoa_id) ?? "",
        [b.titulo.descricao, b.titulo.documento && `NF ${b.titulo.documento}`, b.titulo.parcelas > 1 && `${b.titulo.parcela}/${b.titulo.parcelas}`].filter(Boolean).join(" · "),
        categoria.get(b.titulo.categoria_id)?.nome ?? "",
        [conta.get(b.conta_id), b.forma].filter(Boolean).join(" · "),
        Number(b.valor),
        Number(b.juros) + Number(b.multa),
        Number(b.desconto),
        Number(b.valor) + Number(b.juros) + Number(b.multa),
      ]),
      totais: [
        "Total",
        ...(comAcademia ? [""] : []),
        "",
        "",
        "",
        "",
        lista.reduce((t, b) => t + Number(b.valor), 0),
        lista.reduce((t, b) => t + Number(b.juros) + Number(b.multa), 0),
        lista.reduce((t, b) => t + Number(b.desconto), 0),
        lista.reduce((t, b) => t + Number(b.valor) + Number(b.juros) + Number(b.multa), 0),
      ],
    };
  }

  // Fluxo por grupo e categoria, mês a mês: realizado (extrato das contas) ou previsto (saldo dos títulos em aberto
  // pela previsão de pagamento).
  type Item = { mes: string; categoria_id: string | null; valor: number };
  let itens: Item[];
  if (rel === "fluxo") {
    const contasDaAcademia = f.academia ? (await supabase.from("fin_contas").select("id").eq("academia_id", f.academia)).data?.map((c) => c.id) ?? [] : null;
    const movs = await tudo((de, ate) => {
      let q = supabase.from("fin_movimentos").select("data, valor, categoria_id, conta_id").gte("data", f.de).lte("data", f.ate).order("data").range(de, ate);
      if (contasDaAcademia) q = q.in("conta_id", contasDaAcademia.length ? contasDaAcademia : ["00000000-0000-0000-0000-000000000000"]);
      return q;
    });
    itens = movs.map((m) => ({ mes: m.data.slice(0, 7), categoria_id: m.categoria_id, valor: Number(m.valor) }));
  } else {
    const titulos = await tudo((de, ate) => {
      let q = supabase
        .from("fin_titulos_situacao")
        .select("tipo, previsao, vencimento, categoria_id, saldo")
        .in("situacao", ["aberto", "vencido", "parcial"])
        .gte("vencimento", f.de)
        .lte("vencimento", f.ate)
        .range(de, ate);
      if (f.academia) q = q.eq("academia_id", f.academia);
      return q;
    });
    itens = titulos.map((t) => ({ mes: (t.previsao ?? t.vencimento).slice(0, 7), categoria_id: t.categoria_id, valor: (t.tipo === "pagar" ? -1 : 1) * Number(t.saldo) }));
  }
  const meses = [...new Set(itens.map((i) => i.mes))].sort();
  const chave = (i: Item) => {
    const c = i.categoria_id ? categoria.get(i.categoria_id) : null;
    return { grupo: c?.grupo ?? "Sem categoria", nome: c?.nome ?? "Sem categoria" };
  };
  const porCategoria = new Map<string, { grupo: string; nome: string; valores: Map<string, number> }>();
  for (const i of itens) {
    const k = chave(i);
    const id = `${k.grupo}|${k.nome}`;
    const linha = porCategoria.get(id) ?? { ...k, valores: new Map() };
    linha.valores.set(i.mes, (linha.valores.get(i.mes) ?? 0) + i.valor);
    porCategoria.set(id, linha);
  }
  const ordenadas = [...porCategoria.values()].sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome));
  const linhas: Celula[][] = [];
  for (const grupo of [...new Set(ordenadas.map((o) => o.grupo))]) {
    const doGrupo = ordenadas.filter((o) => o.grupo === grupo);
    const totalMes = (m: string) => doGrupo.reduce((t, o) => t + (o.valores.get(m) ?? 0), 0);
    linhas.push([grupo, "", ...meses.map(totalMes), meses.reduce((t, m) => t + totalMes(m), 0)]);
    for (const o of doGrupo) linhas.push(["", o.nome, ...meses.map((m) => o.valores.get(m) ?? 0), meses.reduce((t, m) => t + (o.valores.get(m) ?? 0), 0)]);
  }
  const totalMes = (m: string) => itens.filter((i) => i.mes === m).reduce((t, i) => t + i.valor, 0);
  return {
    colunas: [{ rotulo: "Grupo", tipo: "texto" }, { rotulo: "Categoria", tipo: "texto" }, ...meses.map((m) => ({ rotulo: rotuloMes(m), tipo: "moeda" as const })), { rotulo: "Total", tipo: "moeda" }],
    linhas,
    totais: ["Resultado de caixa", "", ...meses.map(totalMes), itens.reduce((t, i) => t + i.valor, 0)],
    nota:
      rel === "fluxo"
        ? "Realizado: lançamentos do extrato das contas (baixas, lançamentos avulsos e do banco). Entradas positivas, saídas negativas; as transferências entre contas se anulam."
        : "Previsto: saldo dos títulos em aberto, no mês da previsão de pagamento/recebimento (vencimento no período).",
  };
}

function sum<T extends Record<string, unknown>>(lista: T[], campo: keyof T) {
  return lista.reduce((t, x) => t + Number(x[campo] ?? 0), 0);
}
