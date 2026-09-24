import type { ReactNode } from "react";
import { contextoAcademias } from "@/lib/contexto";
import { motivosDeNaoConversao, periodos, seriesMensais, totaisDoPeriodo, ultimoDiaLancado, type Totais } from "@/lib/painel";
import { ontem } from "@/lib/planilha";
import { GraficoAnual } from "./painel/GraficoAnual";
import { SemAcademias } from "./SemAcademias";

// Painel gerencial: indicadores do dia, do mês e do ano de uma unidade (ou de todas), com comparação
// com o mês e o ano anteriores, gráficos anuais e os motivos de não conversão.

const div = (a: number | null, b: number | null) => (a !== null && b ? a / b : null);
const numero = (n: number | null, casas = 0) =>
  n === null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const moeda = (n: number | null, casas = 2) =>
  n === null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (n: number | null) =>
  n === null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatarDia = (d: string) => d.split("-").reverse().join("/");

type Formato = "numero" | "moeda" | "percentual" | "decimal";
type Indicador = { rotulo: string; formato: Formato; valor: (t: Totais) => number | null; sobeEBom: boolean };

// Linhas da tabela de indicadores (mesma ideia do painel gerencial da rede).
const INDICADORES: Indicador[] = [
  { rotulo: "Visitas", formato: "numero", valor: (t) => t.visitas, sobeEBom: true },
  { rotulo: "Vendas", formato: "numero", valor: (t) => t.vendas, sobeEBom: true },
  { rotulo: "Vendas site", formato: "numero", valor: (t) => t.vendas_site, sobeEBom: true },
  { rotulo: "ICV", formato: "percentual", valor: (t) => div(t.vendas, t.visitas), sobeEBom: true },
  { rotulo: "Visitas não convertidas", formato: "numero", valor: (t) => t.nao_convertidas, sobeEBom: false },
  { rotulo: "Faturamento", formato: "moeda", valor: (t) => t.faturamento, sobeEBom: true },
  { rotulo: "Cancelamentos solicitados", formato: "numero", valor: (t) => t.cancelamentos_solicitados, sobeEBom: false },
  { rotulo: "Cancelamentos efetivados", formato: "numero", valor: (t) => t.cancelamentos_efetivados, sobeEBom: false },
  { rotulo: "Inadimplentes", formato: "numero", valor: (t) => t.inadimplentes, sobeEBom: false },
  { rotulo: "% inadimplência", formato: "percentual", valor: (t) => div(t.inadimplentes, t.ativos_pagantes), sobeEBom: false },
  { rotulo: "Churn", formato: "percentual", valor: (t) => div(t.cancelamentos_efetivados, t.ativos_pagantes), sobeEBom: false },
  { rotulo: "Previsão de churn", formato: "percentual", valor: (t) => div(t.cancelamentos_solicitados, t.ativos_pagantes), sobeEBom: false },
  { rotulo: "NPS (média)", formato: "decimal", valor: (t) => t.nps, sobeEBom: true },
  { rotulo: "Passagens na catraca", formato: "numero", valor: (t) => t.passagens, sobeEBom: true },
  { rotulo: "Check-ins Gympass", formato: "numero", valor: (t) => t.gympass, sobeEBom: true },
  { rotulo: "Gympass (R$)", formato: "moeda", valor: (t) => t.gympass_valor, sobeEBom: true },
  { rotulo: "Contagem de sala", formato: "numero", valor: (t) => t.contagem_sala, sobeEBom: true },
  { rotulo: "Alunos em coletivas", formato: "numero", valor: (t) => t.alunos_coletivas, sobeEBom: true },
  { rotulo: "Alunos em lutas", formato: "numero", valor: (t) => t.alunos_lutas, sobeEBom: true },
];

function formatar(n: number | null, f: Formato) {
  return f === "moeda" ? moeda(n) : f === "percentual" ? pct(n) : f === "decimal" ? numero(n, 1) : numero(n);
}

// Variação: em % para quantidades; em pontos percentuais (p.p.) para taxas. Verde = melhorou, vermelho = piorou.
function Variacao({ atual, anterior, indicador }: { atual: number | null; anterior: number | null; indicador: Indicador }) {
  if (atual === null || anterior === null) return <span className="text-slate-400">—</span>;
  let delta: number;
  let texto: string;
  if (indicador.formato === "percentual") {
    delta = (atual - anterior) * 100;
    texto = `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`;
  } else {
    if (!anterior) return <span className="text-slate-400">—</span>;
    delta = (atual - anterior) / Math.abs(anterior);
    texto = `${delta > 0 ? "+" : ""}${(delta * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  }
  if (Math.abs(delta) < 1e-9) return <span className="text-slate-500">0%</span>;
  const bom = delta > 0 === indicador.sobeEBom;
  return (
    <span className={bom ? "text-emerald-700" : "text-red-700"}>
      {bom ? "▲" : "▼"} {texto}
    </span>
  );
}

function Cartao({ titulo, valor, detalhe, destaque }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "border-marca bg-marca text-white" : "border-slate-200 bg-white"}`}>
      <p className={`text-xs ${destaque ? "text-blue-100" : "text-slate-500"}`}>{titulo}</p>
      <p className={`mt-1 font-semibold tabular-nums ${destaque ? "text-2xl" : "text-xl text-slate-900"}`}>{valor}</p>
      {detalhe && <p className={`mt-0.5 text-xs ${destaque ? "text-blue-100" : "text-slate-500"}`}>{detalhe}</p>}
    </div>
  );
}

function ListaMotivos({ titulo, motivos, total }: { titulo: string; motivos: [string, number][]; total: number }) {
  const maior = Math.max(1, ...motivos.map(([, n]) => n));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-900">{titulo}</p>
        <p className="text-sm font-semibold tabular-nums text-slate-900">{numero(total)}</p>
      </div>
      {motivos.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Nenhuma visita não convertida no período.</p>
      ) : (
        <ul className="space-y-1.5">
          {motivos.map(([motivo, n]) => (
            <li key={motivo} className="text-xs text-slate-700">
              <div className="flex justify-between gap-2">
                <span className="truncate" title={motivo}>
                  {motivo}
                </span>
                <span className="tabular-nums font-medium">{numero(n)}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-marca" style={{ width: `${(n / maior) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ unidade?: string; data?: string }> }) {
  const params = await searchParams;
  const { supabase, academias, admin, selecionada } = await contextoAcademias(params.unidade);
  if (academias.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Painel</h1>
        <SemAcademias admin={admin} />
      </div>
    );
  }
  const unidade = selecionada;

  // Dia de referência: o escolhido ou o último dia com controle diário lançado.
  const referencia =
    params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data)
      ? params.data
      : ((await ultimoDiaLancado(supabase, unidade, ontem())) ?? ontem());
  const p = periodos(referencia);

  const [dia, mes, mesAnterior, ano, anoAnterior, series, motivosMes, motivosAno] = await Promise.all([
    totaisDoPeriodo(p.dia, unidade),
    totaisDoPeriodo(p.mes, unidade),
    totaisDoPeriodo(p.mesAnterior, unidade),
    totaisDoPeriodo(p.ano, unidade),
    totaisDoPeriodo(p.anoAnterior, unidade),
    seriesMensais(supabase, referencia, unidade),
    motivosDeNaoConversao(supabase, p.mes, unidade),
    motivosDeNaoConversao(supabase, p.ano, unidade),
  ]);
  const erro = dia.erro ?? mes.erro;

  // Estrutura das unidades escolhidas (cadastro de academias).
  const escolhidas = unidade ? academias.filter((a) => a.id === unidade) : academias;
  const area = escolhidas.reduce((t, a) => t + (Number(a.area_m2) || 0), 0) || null;
  const custo = escolhidas.reduce((t, a) => t + (Number(a.custo_financeiro) || 0), 0) || null;
  const inventario = escolhidas.reduce(
    (t, a) =>
      t +
      (a.maquinas_peitoral ?? 0) +
      (a.maquinas_costas ?? 0) +
      (a.maquinas_pernas ?? 0) +
      (a.maquinas_cardio ?? 0) +
      (a.maquinas_bancos_abdomen ?? 0),
    0
  );

  const m = mes.totais;
  const ativos = m.ativos_pagantes;
  const adimplentes = ativos !== null ? ativos - (m.inadimplentes ?? 0) : null;
  const diasNoMes = Number(referencia.slice(8, 10));

  return (
    <div className="space-y-5">
      {/* Cabeçalho e filtros */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Painel gerencial</h1>
          <p className="text-sm text-slate-500">
            {unidade ? academias.find((a) => a.id === unidade)?.nome : "Todas as unidades"} · referência{" "}
            <span className="font-medium text-slate-700">{formatarDia(referencia)}</span>
          </p>
        </div>
        <form action="/" className="flex flex-wrap items-end gap-3 text-sm">
          {academias.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Unidade</span>
              <select name="unidade" defaultValue={unidade ?? ""} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
                <option value="">Todas</option>
                {academias.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Data de referência</span>
            <input type="date" name="data" defaultValue={referencia} className="rounded-md border border-slate-300 bg-white px-2 py-1.5" />
          </label>
          <button className="rounded-md bg-marca px-3 py-1.5 font-medium text-white hover:bg-marca-escuro">Ver</button>
        </form>
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Erro ao calcular o painel: {erro}</p>}

      {/* Números principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Cartao destaque titulo={`Faturamento no ano (${referencia.slice(0, 4)})`} valor={moeda(ano.totais.faturamento, 0)} detalhe={`No mês: ${moeda(m.faturamento, 0)}`} />
        <Cartao titulo="Vendas no mês" valor={numero(m.vendas)} detalhe={`ICV ${pct(div(m.vendas, m.visitas))} · ${numero(m.visitas)} visitas`} />
        <Cartao titulo="Ativos pagantes" valor={numero(ativos)} detalhe={`Adimplentes: ${numero(adimplentes)}`} />
        <Cartao titulo="Inadimplentes" valor={numero(m.inadimplentes)} detalhe={`${pct(div(m.inadimplentes, ativos))} dos ativos`} />
        <Cartao
          titulo="Cancelamentos no mês"
          valor={`${numero(m.cancelamentos_efetivados)} efet.`}
          detalhe={`${numero(m.cancelamentos_solicitados)} solicitados · churn ${pct(div(m.cancelamentos_efetivados, ativos))}`}
        />
        <Cartao titulo="NPS médio no mês" valor={numero(m.nps, 1)} detalhe={`${numero(m.dias_lancados)} dias lançados`} />
        <Cartao titulo="Passagens no mês" valor={numero(m.passagens)} detalhe={`${numero(div(m.passagens, diasNoMes), 0)} por dia`} />
        <Cartao titulo="Gympass no mês" valor={numero(m.gympass)} detalhe={moeda(m.gympass_valor)} />
        <Cartao titulo="Área" valor={area ? `${numero(area)} m²` : "—"} detalhe={`Aluno/m²: ${numero(div(ativos, area), 2)}`} />
        <Cartao titulo="Custo financeiro" valor={moeda(custo, 0)} detalhe={`Custo/m²: ${moeda(div(custo, area))}`} />
        <Cartao titulo="Custo por aluno" valor={moeda(div(custo, ativos))} detalhe="custo ÷ ativos pagantes" />
        <Cartao titulo="Inventário" valor={`${numero(inventario)} máquinas`} detalhe={`Máquinas/aluno: ${numero(div(inventario, ativos), 3)}`} />
      </div>

      {/* Gráficos do ano */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GraficoAnual titulo="Faturamento por mês" ano={series.ano} atual={series.faturamento.atual} anterior={series.faturamento.anterior} formato="moeda" />
        <GraficoAnual titulo="Ativos pagantes (fim de cada mês)" ano={series.ano} atual={series.ativos.atual} anterior={series.ativos.anterior} formato="numero" />
      </div>

      {/* Indicadores e motivos */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Indicador</th>
                <th className="px-3 py-2 text-right">Dia</th>
                <th className="px-3 py-2 text-right">Acum. mês</th>
                <th className="px-3 py-2 text-right">Mês anterior</th>
                <th className="px-3 py-2 text-right">Var.</th>
                <th className="px-3 py-2 text-right">Acum. ano</th>
                <th className="px-3 py-2 text-right">Ano anterior</th>
                <th className="px-3 py-2 text-right">Var.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {INDICADORES.map((ind) => {
                const [vd, vm, vma, va, vaa] = [dia, mes, mesAnterior, ano, anoAnterior].map((x) => ind.valor(x.totais));
                return (
                  <tr key={ind.rotulo} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{ind.rotulo}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatar(vd, ind.formato)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatar(vm, ind.formato)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatar(vma, ind.formato)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                      <Variacao atual={vm} anterior={vma} indicador={ind} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatar(va, ind.formato)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatar(vaa, ind.formato)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                      <Variacao atual={va} anterior={vaa} indicador={ind} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            Mês anterior e ano anterior: mesmo trecho do período (até o dia {Number(referencia.slice(8, 10))}). Ativos e
            inadimplentes: último valor lançado no período. Variação em p.p. = pontos percentuais.
          </p>
        </div>
        <div className="space-y-4">
          <ListaMotivos titulo="Não conversão · motivos no mês" motivos={motivosMes.motivos} total={motivosMes.total} />
          <ListaMotivos titulo="Não conversão · motivos no ano" motivos={motivosAno.motivos} total={motivosAno.total} />
        </div>
      </div>
    </div>
  );
}
