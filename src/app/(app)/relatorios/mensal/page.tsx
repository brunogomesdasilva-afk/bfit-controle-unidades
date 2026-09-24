import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoje, intervaloDoMes } from "@/lib/planilha";
import { divisao, soma, totaisPorAcademia, type TotaisAcademia } from "@/lib/relatorios";
import { CabecalhoRelatorio, moeda, nomeDoMes, numero, percentual, TabelaRelatorio, type ColunaRelatorio } from "../comum";

function somarMes(mes: string, delta: number) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Fechamento do mês: totais de cada academia no mês e a média da A.D.B.
export default async function FechamentoMensalPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesUrl } = await searchParams;
  const mes = mesUrl && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesUrl) ? mesUrl : hoje().slice(0, 7);
  const { inicio, fim } = intervaloDoMes(mes);
  const { linhas, erro } = await totaisPorAcademia(inicio, fim);

  // Média da A.D.B de cada academia no mês (poucas linhas: uma por funcionário).
  const supabase = await createClient();
  const { data: avaliacoes } = await supabase.from("avaliacoes_adb").select("academia_id, media").eq("mes", inicio);
  const notas = new Map<string, number[]>();
  for (const a of avaliacoes ?? []) notas.set(a.academia_id, [...(notas.get(a.academia_id) ?? []), Number(a.media)]);
  const mediaAdb = (id: string) => {
    const n = notas.get(id);
    return n?.length ? n.reduce((x, y) => x + y, 0) / n.length : null;
  };
  const todasNotas = [...notas.values()].flat();

  const vendas = soma(linhas, "vendas");
  const visitas = soma(linhas, "visitas");
  const colunas: ColunaRelatorio<TotaisAcademia>[] = [
    { rotulo: "Academia", valor: (l) => l.academia, alinhar: "esquerda", destaque: true },
    { rotulo: "Dias lançados", valor: (l) => numero(l.dias_lancados) },
    { rotulo: "Ativos pag.*", valor: (l) => numero(l.ativos_pagantes), total: numero(soma(linhas, "ativos_pagantes")) },
    { rotulo: "Visitas", valor: (l) => numero(l.visitas), total: numero(visitas) },
    { rotulo: "Vendas", valor: (l) => numero(l.vendas), total: numero(vendas) },
    { rotulo: "Vendas site", valor: (l) => numero(l.vendas_site), total: numero(soma(linhas, "vendas_site")) },
    { rotulo: "ICV %", valor: (l) => percentual(divisao(l.vendas, l.visitas)), total: percentual(divisao(vendas, visitas)) },
    { rotulo: "Não convertidas", valor: (l) => numero(l.nao_convertidas), total: numero(soma(linhas, "nao_convertidas")) },
    { rotulo: "Faturamento", valor: (l) => moeda(l.faturamento), total: moeda(soma(linhas, "faturamento")) },
    { rotulo: "Inadimpl.*", valor: (l) => numero(l.inadimplentes), total: numero(soma(linhas, "inadimplentes")) },
    { rotulo: "Canc. efet.", valor: (l) => numero(l.cancelamentos_efetivados), total: numero(soma(linhas, "cancelamentos_efetivados")) },
    {
      rotulo: "Churn",
      valor: (l) => percentual(divisao(l.cancelamentos_efetivados, l.ativos_pagantes)),
      total: percentual(divisao(soma(linhas, "cancelamentos_efetivados"), soma(linhas, "ativos_pagantes"))),
    },
    { rotulo: "NPS médio", valor: (l) => numero(l.nps, 1) },
    { rotulo: "Passagens", valor: (l) => numero(l.passagens), total: numero(soma(linhas, "passagens")) },
    { rotulo: "Gympass", valor: (l) => numero(l.gympass), total: numero(soma(linhas, "gympass")) },
    { rotulo: "Gympass R$", valor: (l) => moeda(l.gympass_valor), total: moeda(soma(linhas, "gympass_valor")) },
    { rotulo: "Alunos coletivas", valor: (l) => numero(l.alunos_coletivas), total: numero(soma(linhas, "alunos_coletivas")) },
    { rotulo: "Alunos lutas", valor: (l) => numero(l.alunos_lutas), total: numero(soma(linhas, "alunos_lutas")) },
    {
      rotulo: "Nota A.D.B",
      valor: (l) => numero(mediaAdb(l.academia_id), 2),
      total: numero(todasNotas.length ? todasNotas.reduce((x, y) => x + y, 0) / todasNotas.length : null, 2),
    },
  ];

  const botao = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50";
  return (
    <div>
      <CabecalhoRelatorio
        titulo="Fechamento do mês"
        periodo={nomeDoMes(mes)}
        filtros={
          <>
            <Link href={`/relatorios/mensal?mes=${somarMes(mes, -1)}`} className={botao}>
              ‹ Mês anterior
            </Link>
            <Link href={`/relatorios/mensal?mes=${somarMes(mes, 1)}`} className={botao}>
              Próximo mês ›
            </Link>
          </>
        }
      />
      {erro && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Erro ao montar o relatório: {erro}</p>}
      <TabelaRelatorio colunas={colunas} linhas={linhas} chave={(l) => l.academia_id} vazio="Nenhuma academia." />
      <p className="mt-2 text-xs text-slate-500">
        * Ativos pagantes e inadimplentes: valor do último dia lançado no mês. Churn do mês = cancelamentos efetivados no
        mês ÷ ativos pagantes do último dia. Nota A.D.B = média das avaliações do mês.
      </p>
    </div>
  );
}
