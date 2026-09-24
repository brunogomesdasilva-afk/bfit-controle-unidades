import { ontem } from "@/lib/planilha";
import { divisao, soma, totaisPorAcademia, type TotaisAcademia } from "@/lib/relatorios";
import { CabecalhoRelatorio, formatarDia, moeda, numero, percentual, TabelaRelatorio, type ColunaRelatorio } from "../comum";

const CAMPO = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";

// Resumo de um dia (por padrão, o dia anterior) com todas as academias lado a lado.
export default async function ResumoDiarioPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia: diaUrl } = await searchParams;
  const dia = diaUrl && /^\d{4}-\d{2}-\d{2}$/.test(diaUrl) ? diaUrl : ontem();
  const { linhas, erro } = await totaisPorAcademia(dia, dia);

  const vendas = soma(linhas, "vendas");
  const visitas = soma(linhas, "visitas");
  const colunas: ColunaRelatorio<TotaisAcademia>[] = [
    { rotulo: "Academia", valor: (l) => l.academia, alinhar: "esquerda", destaque: true },
    { rotulo: "Ativos pag.", valor: (l) => numero(l.ativos_pagantes), total: numero(soma(linhas, "ativos_pagantes")) },
    { rotulo: "Visitas", valor: (l) => numero(l.visitas), total: numero(visitas) },
    { rotulo: "Vendas", valor: (l) => numero(l.vendas), total: numero(vendas) },
    { rotulo: "ICV %", valor: (l) => percentual(divisao(l.vendas, l.visitas)), total: percentual(divisao(vendas, visitas)) },
    { rotulo: "Não convertidas", valor: (l) => numero(l.nao_convertidas), total: numero(soma(linhas, "nao_convertidas")) },
    { rotulo: "Faturamento", valor: (l) => moeda(l.faturamento), total: moeda(soma(linhas, "faturamento")) },
    { rotulo: "Canc. solic.", valor: (l) => numero(l.cancelamentos_solicitados), total: numero(soma(linhas, "cancelamentos_solicitados")) },
    { rotulo: "Canc. efet.", valor: (l) => numero(l.cancelamentos_efetivados), total: numero(soma(linhas, "cancelamentos_efetivados")) },
    {
      rotulo: "Churn",
      valor: (l) => percentual(divisao(l.cancelamentos_efetivados, l.ativos_pagantes)),
      total: percentual(divisao(soma(linhas, "cancelamentos_efetivados"), soma(linhas, "ativos_pagantes"))),
    },
    { rotulo: "NPS", valor: (l) => numero(l.nps, 1) },
    { rotulo: "Passagens", valor: (l) => numero(l.passagens), total: numero(soma(linhas, "passagens")) },
    { rotulo: "Gympass", valor: (l) => numero(l.gympass), total: numero(soma(linhas, "gympass")) },
    { rotulo: "Gympass R$", valor: (l) => moeda(l.gympass_valor), total: moeda(soma(linhas, "gympass_valor")) },
    { rotulo: "Contagem sala", valor: (l) => numero(l.contagem_sala), total: numero(soma(linhas, "contagem_sala")) },
    { rotulo: "Alunos coletivas", valor: (l) => numero(l.alunos_coletivas), total: numero(soma(linhas, "alunos_coletivas")) },
    { rotulo: "Alunos lutas", valor: (l) => numero(l.alunos_lutas), total: numero(soma(linhas, "alunos_lutas")) },
  ];

  return (
    <div>
      <CabecalhoRelatorio
        titulo="Resumo do dia"
        periodo={formatarDia(dia) + (diaUrl ? "" : " (dia anterior)")}
        filtros={
          <form action="/relatorios/diario" className="flex items-center gap-1.5">
            <label htmlFor="dia" className="text-slate-500">
              Dia
            </label>
            <input id="dia" type="date" name="dia" defaultValue={dia} className={CAMPO} />
            <button className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50">
              Ver
            </button>
          </form>
        }
      />
      {erro && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Erro ao montar o relatório: {erro}</p>}
      <TabelaRelatorio colunas={colunas} linhas={linhas} chave={(l) => l.academia_id} vazio="Nenhuma academia." />
      <p className="mt-2 text-xs text-slate-500">
        Controle diário, conversão e contagens: lançamentos do dia. Passagens e Gympass: planilhas importadas. ICV = vendas ÷
        visitas; churn = cancelamentos efetivados ÷ ativos pagantes.
      </p>
    </div>
  );
}
