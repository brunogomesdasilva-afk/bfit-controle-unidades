import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarPdfFechamento, type SecaoPdf } from "@/lib/pdfFechamento";

// Relatório semanal das unidades (e-mail de quinta-feira, 8h): para cada academia, os números do controle diário
// no dia de referência ("Hoje" = véspera do envio) e sete dias antes, no modelo da planilha do Bruno.
//   Total de ativos = adimplentes (ativos pagantes) + inadimplentes
//   % inadimplentes = inadimplentes ÷ adimplentes
//   Ativos últimos 7 dias = adimplentes do dia − adimplentes de 7 dias antes
//   Vendas e faturamento do mês = soma do dia 1 até o dia; mês anterior = mês inteiro
//   Fat. mês anterior mesma data = soma do mês anterior do dia 1 até o mesmo dia
//   Churn = cancelamentos efetivados no mês até o dia ÷ total de ativos do dia

type Linha = {
  academia_id: string;
  data: string;
  ativos_pagantes: number | null;
  inadimplentes: number | null;
  vendas: number | null;
  faturamento: number | null;
  cancelamentos_efetivados: number | null;
};

export type ColunaSemanal = {
  data: string; // dia de referência da coluna
  dataAtivos: string | null; // dia de onde vieram ativos/inadimplentes (o último lançado até a data)
  totalAtivos: number | null;
  adimplentes: number | null;
  inadimplentes: number | null;
  pctInadimplentes: number | null;
  ativos7dias: number | null;
  vendasMes: number;
  vendasMesAnterior: number;
  faturamentoMes: number;
  faturamentoMesAnteriorMesmaData: number;
  faturamentoMesAnterior: number;
  churn: number | null;
};
export type UnidadeSemanal = { nome: string; hoje: ColunaSemanal; semanaAnterior: ColunaSemanal };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (data: string, dias: number) => iso(new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86400000));
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

function mesAnterior(data: string) {
  const [a, m, d] = data.split("-").map(Number);
  const [aa, mm] = m === 1 ? [a - 1, 12] : [a, m - 1];
  const fim = ultimoDia(aa, mm);
  return { inicio: `${aa}-${pad(mm)}-01`, mesmoDia: `${aa}-${pad(mm)}-${pad(Math.min(d, fim))}`, fim: `${aa}-${pad(mm)}-${pad(fim)}` };
}

function coluna(linhas: Linha[], data: string): ColunaSemanal {
  const soma = (de: string, ate: string, campo: "vendas" | "faturamento" | "cancelamentos_efetivados") =>
    linhas.filter((l) => l.data >= de && l.data <= ate).reduce((t, l) => t + (Number(l[campo]) || 0), 0);
  // Ativos: o último dia lançado até a data (se o dia não foi lançado, vale o anterior mais próximo).
  const ultimoAte = (ate: string) => [...linhas].filter((l) => l.data <= ate && l.ativos_pagantes !== null).sort((a, b) => b.data.localeCompare(a.data))[0];
  const dia = ultimoAte(data);
  const semanaAntes = ultimoAte(somarDias(data, -7));
  const adimplentes = dia?.ativos_pagantes ?? null;
  const inadimplentes = dia?.inadimplentes ?? null;
  const totalAtivos = adimplentes !== null ? adimplentes + (inadimplentes ?? 0) : null;
  const inicioMes = `${data.slice(0, 8)}01`;
  const ant = mesAnterior(data);
  const cancelamentos = soma(inicioMes, data, "cancelamentos_efetivados");
  return {
    data,
    dataAtivos: dia?.data ?? null,
    totalAtivos,
    adimplentes,
    inadimplentes,
    pctInadimplentes: adimplentes && inadimplentes !== null ? inadimplentes / adimplentes : null,
    ativos7dias: adimplentes !== null && semanaAntes?.ativos_pagantes != null ? adimplentes - semanaAntes.ativos_pagantes : null,
    vendasMes: soma(inicioMes, data, "vendas"),
    vendasMesAnterior: soma(ant.inicio, ant.fim, "vendas"),
    faturamentoMes: soma(inicioMes, data, "faturamento"),
    faturamentoMesAnteriorMesmaData: soma(ant.inicio, ant.mesmoDia, "faturamento"),
    faturamentoMesAnterior: soma(ant.inicio, ant.fim, "faturamento"),
    churn: totalAtivos ? cancelamentos / totalAtivos : null,
  };
}

// Soma das unidades numa coluna (o "Total das unidades").
function somarColunas(cs: ColunaSemanal[]): ColunaSemanal {
  const s = (f: (c: ColunaSemanal) => number | null) => (cs.some((c) => f(c) === null) ? null : cs.reduce((t, c) => t + (f(c) ?? 0), 0));
  const totalAtivos = s((c) => c.totalAtivos);
  const adimplentes = s((c) => c.adimplentes);
  const inadimplentes = s((c) => c.inadimplentes);
  const cancelamentos = cs.reduce((t, c) => t + (c.churn ?? 0) * (c.totalAtivos ?? 0), 0);
  return {
    data: cs[0].data,
    dataAtivos: cs[0].data,
    totalAtivos,
    adimplentes,
    inadimplentes,
    pctInadimplentes: adimplentes && inadimplentes !== null ? inadimplentes / adimplentes : null,
    ativos7dias: s((c) => c.ativos7dias),
    vendasMes: cs.reduce((t, c) => t + c.vendasMes, 0),
    vendasMesAnterior: cs.reduce((t, c) => t + c.vendasMesAnterior, 0),
    faturamentoMes: cs.reduce((t, c) => t + c.faturamentoMes, 0),
    faturamentoMesAnteriorMesmaData: cs.reduce((t, c) => t + c.faturamentoMesAnteriorMesmaData, 0),
    faturamentoMesAnterior: cs.reduce((t, c) => t + c.faturamentoMesAnterior, 0),
    churn: totalAtivos ? cancelamentos / totalAtivos : null,
  };
}

// referencia = "Hoje" do relatório (a véspera do envio). A segunda coluna é 7 dias antes.
export async function montarRelatorioSemanal(db: SupabaseClient, referencia: string) {
  const anterior = somarDias(referencia, -7);
  const desde = mesAnterior(somarDias(anterior, -7)).inicio;
  const [{ data: academias }, linhas] = await Promise.all([
    db.from("academias").select("id, nome").order("nome"),
    (async () => {
      const saida: Linha[] = [];
      for (let de = 0; ; de += 1000) {
        const { data } = await db
          .from("controle_diario")
          .select("academia_id, data, ativos_pagantes, inadimplentes, vendas, faturamento, cancelamentos_efetivados")
          .gte("data", desde)
          .lte("data", referencia)
          .order("data")
          .range(de, de + 999);
        saida.push(...((data ?? []) as Linha[]));
        if (!data || data.length < 1000) return saida;
      }
    })(),
  ]);
  const unidades: UnidadeSemanal[] = (academias ?? []).map((a) => {
    const da = linhas.filter((l) => l.academia_id === a.id);
    return { nome: a.nome as string, hoje: coluna(da, referencia), semanaAnterior: coluna(da, anterior) };
  });
  const total: UnidadeSemanal = {
    nome: "Total das unidades",
    hoje: somarColunas(unidades.map((u) => u.hoje)),
    semanaAnterior: somarColunas(unidades.map((u) => u.semanaAnterior)),
  };
  return { referencia, anterior, unidades, total };
}

export type RelatorioSemanal = Awaited<ReturnType<typeof montarRelatorioSemanal>>;

// ------------------------------------------------------------------ E-mail (HTML com estilos na linha)
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const int = (n: number | null) => (n === null ? "-" : n.toLocaleString("pt-BR"));
const pct = (n: number | null) => (n === null ? "-" : `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sinal = (n: number | null) => (n === null ? "-" : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR")}`);

const corSinal = (n: number | null) => (n === null || n === 0 ? null : n < 0 ? "vermelho" : "verde");
const FUNDOS = { vermelho: "#fde2e2", verde: "#dcfce7" };

// Linhas da tabela de cada unidade (e-mail e PDF): rótulo, valor formatado e a cor de fundo da célula (negativo vermelho, positivo verde).
const INDICADORES: [string, (c: ColunaSemanal) => string, ((c: ColunaSemanal) => "vermelho" | "verde" | null)?][] = [
  ["Total de ativos", (c) => int(c.totalAtivos)],
  ["Adimplentes", (c) => int(c.adimplentes)],
  ["Inadimplentes", (c) => int(c.inadimplentes)],
  ["% Inadimplentes", (c) => pct(c.pctInadimplentes)],
  ["Ativos últimos 7 dias", (c) => sinal(c.ativos7dias), (c) => corSinal(c.ativos7dias)],
  ["Total de vendas mês", (c) => int(c.vendasMes)],
  ["Total de vendas mês anterior", (c) => int(c.vendasMesAnterior)],
  ["Faturamento mês atual", (c) => brl(c.faturamentoMes)],
  ["Fat. mês anterior mesma data", (c) => brl(c.faturamentoMesAnteriorMesmaData)],
  ["Faturamento mês anterior", (c) => brl(c.faturamentoMesAnterior)],
  ["Churn", (c) => pct(c.churn)],
];

const avisos = (u: UnidadeSemanal) =>
  [u.hoje, u.semanaAnterior]
    .filter((c) => c.dataAtivos && c.dataAtivos !== c.data)
    .map((c) => `Ativos de ${dm(c.data)}: dia sem lançamento, usado ${dm(c.dataAtivos!)}.`)
    .concat([u.hoje, u.semanaAnterior].filter((c) => !c.dataAtivos).map((c) => `Sem lançamentos até ${dm(c.data)}.`));

const LEGENDA =
  "Total de ativos = adimplentes + inadimplentes · % inadimplentes = inadimplentes ÷ adimplentes · Ativos últimos 7 dias = variação dos adimplentes em 7 dias · Churn = cancelamentos efetivados no mês ÷ total de ativos.";

function tabela(u: UnidadeSemanal, destaque = false) {
  const linhas = INDICADORES;
  const borda = "border:1px solid #cbd5e1;";
  const cel = `${borda}padding:4px 8px;font-size:13px;`;
  const aviso = avisos(u);
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:440px;font-family:Calibri,Arial,sans-serif;color:#0f172a;">
  <tr style="background:${destaque ? "#0b4ea2" : "#e2e8f0"};color:${destaque ? "#fff" : "#0f172a"};">
    <th style="${cel}text-align:left;">${u.nome}</th><th style="${cel}text-align:center;">Hoje (${dm(u.hoje.data)})</th><th style="${cel}text-align:center;">${dm(u.semanaAnterior.data)}</th>
  </tr>
  ${linhas
    .map(
      ([rotulo, valor, cor]) =>
        `<tr><td style="${cel}">${rotulo}</td>${[u.hoje, u.semanaAnterior]
          .map((c) => {
            const k = cor?.(c);
            return `<td style="${cel}text-align:right;white-space:nowrap;${k ? `background:${FUNDOS[k]};font-weight:bold;` : ""}">${valor(c)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("\n  ")}
</table>${aviso.length ? `<p style="margin:4px 0 0;font-size:11px;color:#92400e;font-family:Arial,sans-serif;">${aviso.join(" ")}</p>` : ""}`;
}

export function htmlRelatorioSemanal(r: RelatorioSemanal) {
  const bloco = (u: UnidadeSemanal, destaque = false) =>
    `<div style="display:inline-block;vertical-align:top;width:100%;max-width:440px;margin:0 16px 20px 0;">${tabela(u, destaque)}</div>`;
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;">
<p style="font-size:15px;margin:0 0 4px;"><b>Relatório semanal das unidades</b></p>
<p style="font-size:12px;color:#475569;margin:0 0 16px;">"Hoje" = ${dm(r.referencia)} (último dia completo) · comparação com ${dm(r.anterior)} · dados do controle diário do BFIT.</p>
${bloco(r.total, true)}
${r.unidades.map((u) => bloco(u)).join("\n")}
<p style="font-size:11px;color:#64748b;margin:8px 0 0;">${LEGENDA}</p>
</div>`;
}

// ------------------------------------------------------------------ PDF (para o envio por WhatsApp)
// Uma tabela por unidade (o total primeiro), com os mesmos indicadores do e-mail.
export async function pdfRelatorioSemanal(r: RelatorioSemanal) {
  const secao = (u: UnidadeSemanal): SecaoPdf => ({
    titulo: u.nome,
    mostrarQuantidade: false,
    colunas: [
      { rotulo: "Indicador", largura: 223 },
      { rotulo: `Hoje (${dm(u.hoje.data)})`, largura: 150 },
      { rotulo: dm(u.semanaAnterior.data), largura: 150 },
    ],
    linhas: INDICADORES.map(([rotulo, valor]) => [rotulo, valor(u.hoje), valor(u.semanaAnterior)]),
    fundosCelulas: INDICADORES.map(([, , cor]) => (cor ? [null, cor(u.hoje), cor(u.semanaAnterior)] : undefined)),
    vazio: "",
  });
  const observacoes = [r.total, ...r.unidades].flatMap((u) => avisos(u).map((a) => [u.nome, a]));
  const pdf = await gerarPdfFechamento({
    academia: "Todas as unidades",
    mesTexto: "",
    titulo: "Relatório semanal das unidades",
    subtitulo: `"Hoje" = ${dm(r.referencia)} (último dia completo) · comparação com ${dm(r.anterior)} · dados do controle diário`,
    secoes: [
      secao(r.total),
      ...r.unidades.map(secao),
      {
        titulo: "Observações",
        mostrarQuantidade: false,
        colunas: [
          { rotulo: "Unidade", largura: 150 },
          { rotulo: "Observação", largura: 373 },
        ],
        linhas: [...observacoes, ["Como ler", LEGENDA]],
        vazio: "",
      },
    ],
  });
  return { pdf, arquivo: `Relatorio semanal ${r.referencia}.pdf` };
}
