import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import type { LinhaBalancete } from "@/lib/balancete";
import { contextoAcademias } from "@/lib/contexto";
import { montarBalanco, montarDfc, montarDre } from "@/lib/demonstracoes";
import { nomeMes, rotuloPeriodo } from "@/lib/nomeBalancete";
import { hoje } from "@/lib/planilha";
import { SemAcademias } from "../../SemAcademias";
import { excluirBalancete, importarBalancete } from "./actions";
import { BotaoExcluirBalancete } from "./BotaoExcluirBalancete";
import { ImportarBalancetes } from "./ImportarBalancetes";
import { juntar, linhasDfc, linhasDre, quadroBalanco, type Pacote } from "./montagem";
import { TabelaDemonstrativo, type ColunaDemo } from "./TabelaDemonstrativo";

// Fechamento mensal (menu Financeiro), no estilo do relatório gerencial: DRE e balanço lado a lado e, na outra aba,
// o fluxo de caixa (DFC) e os indicadores. Visão anual (ano anterior × ano atual acumulado) ou mês a mês (uma coluna
// por balancete importado); em "Todas", o consolidado ou uma coluna por academia (sem eliminar os repasses entre elas).

type Balancete = { id: string; academia_id: string; ano: number; mes_inicio: number; mes_fim: number; arquivo_nome: string; importado_em: string };

const ABAS = { resultado: "DRE e balanço", caixa: "Fluxo de caixa e indicadores" } as const;
type Aba = keyof typeof ABAS;
const curto = (m: number) => nomeMes(m).slice(0, 3);
const rotuloCurto = (b: Pick<Balancete, "mes_inicio" | "mes_fim">) => (b.mes_inicio === b.mes_fim ? nomeMes(b.mes_inicio) : `${curto(b.mes_inicio)} a ${curto(b.mes_fim)}`);
const fimDoMes = (ano: number, mes: number) => `${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;

// Indicadores (acumulados de cada coluna), em quadros pequenos no mesmo estilo.
type Indicador = { rotulo: string; valor: (q: Pacote) => string; dica: string };
function quadrosIndicadores(): { titulo: string; itens: Indicador[] }[] {
  const r = (v: number) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
  const pc = (v: number) => (Number.isFinite(v) ? `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "–");
  const x = (v: number) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
  const div = (a: number, b: number) => (Math.abs(b) < 0.005 ? NaN : a / b);
  const divida = (q: Pacote) => q.balancoFim.grupos.emprestimos_cp.valor + q.balancoFim.grupos.emprestimos_lp.valor - q.balancoFim.grupos.disponivel.valor;
  return [
    {
      titulo: "Resultado",
      itens: [
        { rotulo: "Receita média por mês", dica: "Receita de serviços ÷ meses", valor: (q) => r(div(q.dre.receitaBruta, q.meses)) },
        { rotulo: "Margem EBITDA", dica: "EBITDA ÷ receita", valor: (q) => pc(div(q.dre.ebitda, q.dre.receitaBruta)) },
        { rotulo: "Margem líquida", dica: "Lucro líquido ÷ receita", valor: (q) => pc(div(q.dre.lucro, q.dre.receitaBruta)) },
        { rotulo: "Peso do pessoal", dica: "Pessoal e encargos ÷ receita", valor: (q) => pc(div(-q.dre.grupos.pessoal.valor, q.dre.receitaBruta)) },
        { rotulo: "Peso da ocupação", dica: "Aluguel, condomínio, IPTU, energia, água e gás ÷ receita", valor: (q) => pc(div(-q.dre.grupos.ocupacao.valor, q.dre.receitaBruta)) },
        { rotulo: "ROE (ao ano)", dica: "Lucro em 12 meses ÷ patrimônio líquido médio", valor: (q) => pc(div((q.dre.lucro * 12) / q.meses, (q.balancoInicio.patrimonio + q.balancoFim.patrimonio) / 2)) },
      ],
    },
    {
      titulo: "Caixa",
      itens: [
        { rotulo: "Caixa gerado pela operação", dica: "Lucro ± capital de giro", valor: (q) => r(q.dfc.operacional) },
        { rotulo: "Caixa livre", dica: "Operação − investimentos", valor: (q) => r(q.dfc.operacional + q.dfc.investimento) },
        { rotulo: "Conversão do EBITDA em caixa", dica: "Caixa da operação ÷ EBITDA", valor: (q) => pc(div(q.dfc.operacional, q.dre.ebitda)) },
        { rotulo: "Distribuição e sócios", dica: "Distribuição de lucros + sócios e empresas do grupo", valor: (q) => r(q.dfc.grupos.distribuicao.valor + q.dfc.grupos.socios.valor) },
        { rotulo: "Prazo médio de recebimento", dica: "Contas a receber ÷ receita por dia", valor: (q) => `${Math.round(div(q.balancoFim.grupos.receber.valor, q.dre.receitaBruta / (q.meses * 30))) || 0} dias` },
      ],
    },
    {
      titulo: "Liquidez e endividamento",
      itens: [
        { rotulo: "Liquidez corrente", dica: "Ativo circulante ÷ passivo circulante", valor: (q) => x(div(q.balancoFim.ativoCirculante, q.balancoFim.passivoCirculante)) },
        {
          rotulo: "Liquidez sem sócios e grupo",
          dica: "Sem os adiantamentos a sócios e empresas do grupo",
          valor: (q) => x(div(q.balancoFim.ativoCirculante - q.balancoFim.grupos.socios_ativo.valor, q.balancoFim.passivoCirculante)),
        },
        { rotulo: "Liquidez imediata", dica: "Caixa ÷ passivo circulante", valor: (q) => x(div(q.balancoFim.grupos.disponivel.valor, q.balancoFim.passivoCirculante)) },
        { rotulo: "Endividamento geral", dica: "Passivo (sem o patrimônio) ÷ ativo", valor: (q) => pc(div(q.balancoFim.passivoCirculante + q.balancoFim.passivoNaoCirculante, q.balancoFim.ativo)) },
        { rotulo: "Dívida bancária líquida", dica: "Empréstimos e saldo negativo − caixa", valor: (q) => r(divida(q)) },
        { rotulo: "Dívida líquida ÷ EBITDA", dica: "Em anos de EBITDA (negativo: caixa maior que a dívida)", valor: (q) => x(div(divida(q), (q.dre.ebitda * 12) / q.meses)) },
      ],
    },
  ];
}

function QuadroIndicadores({ titulo, itens, colunas }: { titulo: string; itens: Indicador[]; colunas: Pacote[] }) {
  return (
    <div className="w-fit min-w-0 max-w-full">
      <h3 className="mb-2 text-center text-base font-semibold text-sky-600">{titulo}</h3>
      <div className="overflow-auto">
        <table className="min-w-max text-[12.5px] text-slate-800">
          <thead>
            <tr className="border-b border-slate-800 text-slate-700">
              <th className="px-2 pb-1 text-left font-normal">Descrição</th>
              {colunas.map((c) => (
                <th key={c.rotulo} className="px-2 pb-1 text-right font-normal">
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((i, n) => (
              <tr key={i.rotulo} className={n % 2 ? "bg-slate-100" : "bg-white"} title={i.dica}>
                <td className="whitespace-nowrap py-[3px] pl-2 pr-4">{i.rotulo}</td>
                {colunas.map((c) => (
                  <td key={c.rotulo} className="whitespace-nowrap border-l border-slate-300 px-2 py-[3px] text-right tabular-nums">
                    {i.valor(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function buscarLinhas(supabase: Awaited<ReturnType<typeof contextoAcademias>>["supabase"], ids: string[]) {
  const linhas: (LinhaBalancete & { balancete_id: string })[] = [];
  for (let de = 0; ids.length; de += 1000) {
    const { data, error } = await supabase
      .from("balancete_linhas")
      .select("balancete_id, ordem, conta, descricao, saldo_anterior, debito, credito, saldo_atual")
      .in("balancete_id", ids)
      .order("id")
      .range(de, de + 999);
    if (error || !data?.length) break;
    linhas.push(...data.map((l) => ({ ...l, saldo_anterior: Number(l.saldo_anterior), debito: Number(l.debito), credito: Number(l.credito), saldo_atual: Number(l.saldo_atual) })));
    if (data.length < 1000) break;
  }
  return linhas;
}

export default async function FechamentoPage({ searchParams }: PageProps<"/financeiro/fechamento">) {
  await exigirModulo("financeiro");
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(typeof params.academia === "string" ? params.academia : undefined);
  const aba: Aba = typeof params.aba === "string" && params.aba in ABAS ? (params.aba as Aba) : "resultado";
  const mensal = params.visao === "mensal";
  if (academias.length === 0)
    return (
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Fechamento mensal</h1>
        <SemAcademias admin={admin} />
      </div>
    );

  const ids = selecionada ? [selecionada] : academias.map((a) => a.id);
  const { data: todos } = await supabase.from("balancetes").select("id, academia_id, ano, mes_inicio, mes_fim, arquivo_nome, importado_em").in("academia_id", ids).order("ano").order("mes_inicio");
  const balancetes = (todos ?? []) as Balancete[];
  const anos = [...new Set(balancetes.map((b) => b.ano))].sort((a, b) => b - a);
  const ano = typeof params.ano === "string" && anos.includes(Number(params.ano)) ? Number(params.ano) : (anos[0] ?? Number(hoje().slice(0, 4)));
  const usados = balancetes.filter((b) => b.ano === ano || b.ano === ano - 1);
  const linhas = await buscarLinhas(supabase, usados.map((b) => b.id));
  const nomeAcademia = (id: string) => academias.find((a) => a.id === id)?.nome ?? "";

  const pacoteDe = (b: Balancete): Omit<Pacote, "rotulo" | "detalhe"> => {
    const l = linhas.filter((x) => x.balancete_id === b.id);
    return { meses: b.mes_fim - b.mes_inicio + 1, dre: montarDre(l), balancoFim: montarBalanco(l, "atual"), balancoInicio: montarBalanco(l, "anterior"), dfc: montarDfc(l) };
  };
  const doAno = (academia: string, a: number) => usados.filter((b) => b.academia_id === academia && b.ano === a).sort((x, y) => x.mes_inicio - y.mes_inicio);
  const meses = (lista: Balancete[]) => (lista.length ? (lista[0].mes_inicio === 1 && lista[lista.length - 1].mes_fim === 12 ? "" : `${curto(lista[0].mes_inicio)} a ${curto(lista[lista.length - 1].mes_fim)}`) : "");
  // Consolidado de um ano (todas as academias que têm balancete nele).
  const consolidado = (a: number, rotulo: string) => {
    const lista = academias.map((x) => doAno(x.id, a)).filter((l) => l.length);
    if (!lista.length) return null;
    const porAcademia = lista.map((l) => juntar(l.map(pacoteDe), ""));
    return juntar(porAcademia, rotulo, meses(lista.flat().sort((x, y) => x.mes_inicio - y.mes_inicio)), false);
  };

  let colunas: Pacote[] = [];
  const ultimoMes = Math.max(0, ...usados.filter((b) => b.ano === ano).map((b) => b.mes_fim));
  if (selecionada) {
    const atuais = doAno(selecionada, ano);
    const anteriores = doAno(selecionada, ano - 1);
    if (mensal) {
      colunas = atuais.map((b) => ({ ...pacoteDe(b), rotulo: rotuloCurto(b) }));
      if (atuais.length > 1) colunas.push(juntar(atuais.map(pacoteDe), `Acumulado ${ano}`));
    } else {
      if (anteriores.length) colunas.push(juntar(anteriores.map(pacoteDe), String(ano - 1), meses(anteriores)));
      if (atuais.length) colunas.push(juntar(atuais.map(pacoteDe), String(ano), meses(atuais)));
    }
  } else if (mensal) {
    colunas = academias
      .map((a) => ({ a, lista: doAno(a.id, ano) }))
      .filter((x) => x.lista.length)
      .map((x) => juntar(x.lista.map(pacoteDe), x.a.nome, meses(x.lista)));
    if (colunas.length > 1) colunas.push(juntar(colunas, "Consolidado", "", false));
  } else {
    colunas = [consolidado(ano - 1, String(ano - 1)), consolidado(ano, String(ano))].filter((c): c is Pacote => Boolean(c));
  }
  const atual = colunas[colunas.length - 1];
  const temAno = usados.some((b) => b.ano === ano);

  const link = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const estado = { academia: selecionada, ano: String(ano), aba, visao: mensal ? "mensal" : null, ...mudar };
    for (const [k, v] of Object.entries(estado)) if (v && !(k === "aba" && v === "resultado")) q.set(k, v);
    return `/financeiro/fechamento?${q.toString()}`;
  };
  const colunasDemo: ColunaDemo[] = colunas.map((c) => ({ rotulo: c.rotulo, detalhe: c.detalhe }));

  // Balanço: abertura do ano (fim do ano anterior) × fim do último mês importado do ano.
  const balancoAtual = selecionada ? juntar(doAno(selecionada, ano).map(pacoteDe), "") : consolidado(ano, "");
  const balancos = balancoAtual ? [balancoAtual.balancoInicio, balancoAtual.balancoFim] : [];
  const colunasBalanco: ColunaDemo[] = [{ rotulo: `31/12/${ano - 1}` }, { rotulo: ultimoMes ? fimDoMes(ano, ultimoMes) : String(ano) }];
  const listaImportados = balancetes.filter((b) => b.ano === ano).sort((x, y) => nomeAcademia(x.academia_id).localeCompare(nomeAcademia(y.academia_id)) || x.mes_inicio - y.mes_inicio);
  const pilula = (ativa: boolean) => `rounded-full px-3 py-1 text-sm ${ativa ? "bg-marca font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-slate-100 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">BFIT · Financeiro</p>
          <h1 className="text-xl font-light uppercase tracking-wide text-slate-700">Demonstração do resultado</h1>
          <p className="text-sm text-slate-600">
            {selecionada ? nomeAcademia(selecionada) : "Todas as academias"} · {ano}
            {ultimoMes ? ` (até ${nomeMes(ultimoMes)})` : ""}
          </p>
        </div>
        {anos.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Ano</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
              {anos.map((a) => (
                <Link key={a} href={link({ ano: String(a) })} aria-current={a === ano ? "page" : undefined} className={`border-l border-slate-300 px-3 py-1 first:border-l-0 ${a === ano ? "bg-marca font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {a}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {academias.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Academias">
          {[{ id: null as string | null, nome: "Todas" }, ...academias].map((a) => (
            <Link
              key={a.id ?? "todas"}
              href={link({ academia: a.id })}
              aria-current={a.id === selecionada ? "page" : undefined}
              className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${a.id === selecionada ? "border-slate-200 border-b-white bg-white font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(ABAS) as [Aba, string][]).map(([k, rotulo]) => (
            <Link key={k} href={link({ aba: k })} aria-current={k === aba ? "page" : undefined} className={pilula(k === aba)}>
              {rotulo}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href={link({ visao: null })} className={pilula(!mensal)}>
            {selecionada ? `${ano - 1} × ${ano}` : "Consolidado"}
          </Link>
          <Link href={link({ visao: "mensal" })} className={pilula(mensal)}>
            {selecionada ? "Mês a mês" : "Por academia"}
          </Link>
        </div>
      </div>

      {!temAno || !atual ? (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Nenhum balancete importado {selecionada ? `de ${nomeAcademia(selecionada)} ` : ""}em {ano}. Importe abaixo.</p>
      ) : aba === "resultado" ? (
        <div className={`grid gap-8 ${colunas.length <= 2 ? "min-[1750px]:grid-cols-[auto_1fr]" : ""}`}>
          <div className="space-y-8">
            <TabelaDemonstrativo titulo="D.R.E" colunas={colunasDemo} linhas={linhasDre(colunas)} base={colunas.map((c) => c.dre.receitaBruta)} />
            <TabelaDemonstrativo
              titulo="Visão geral"
              colunas={colunasDemo}
              linhas={[
                { rotulo: "(+) Caixa no fim", valores: colunas.map((c) => c.dfc.caixaFinal) },
                { rotulo: "(+) EBITDA", valores: colunas.map((c) => c.dre.ebitda) },
                { rotulo: "(=) Lucro líquido", valores: colunas.map((c) => c.dre.lucro) },
                { rotulo: "Caixa livre (operação − investimentos)", valores: colunas.map((c) => c.dfc.operacional + c.dfc.investimento) },
              ]}
            />
          </div>
          {balancos.length > 0 && (
            <div className="grid content-start gap-8 sm:grid-cols-2">
              <TabelaDemonstrativo titulo="Ativo circulante" colunas={colunasBalanco} linhas={quadroBalanco("Ativo circulante", balancos, (b) => b.ativoCirculante)} />
              <TabelaDemonstrativo titulo="Passivo circulante" colunas={colunasBalanco} linhas={quadroBalanco("Passivo circulante", balancos, (b) => b.passivoCirculante)} />
              <TabelaDemonstrativo titulo="Ativo não circulante" colunas={colunasBalanco} linhas={quadroBalanco("Ativo não circulante", balancos, (b) => b.ativoNaoCirculante)} />
              <div className="space-y-8">
                {balancos.some((b) => Math.abs(b.passivoNaoCirculante) >= 0.005) && (
                  <TabelaDemonstrativo titulo="Passivo não circulante" colunas={colunasBalanco} linhas={quadroBalanco("Passivo não circulante", balancos, (b) => b.passivoNaoCirculante)} />
                )}
                <TabelaDemonstrativo titulo="Patrimônio líquido" colunas={colunasBalanco} linhas={quadroBalanco("Patrimônio líquido", balancos, (b) => b.patrimonio)} />
              </div>
              <TabelaDemonstrativo titulo="" colunas={colunasBalanco} linhas={[{ rotulo: "Total do ativo", forte: true, valores: balancos.map((b) => b.ativo) }]} />
              <TabelaDemonstrativo titulo="" colunas={colunasBalanco} linhas={[{ rotulo: "Total do passivo", forte: true, valores: balancos.map((b) => b.passivo) }]} />
            </div>
          )}
          <p className="text-xs text-slate-500 min-[1750px]:col-span-2">
            Clique numa linha para ver as contas da contabilidade. % sobre a receita de serviços. Custo ocupação (CTO): aluguel, condomínio, IPTU, energia, água e gás. O resultado do ano ainda
            não encerrado pela contabilidade entra no patrimônio líquido, para o balanço fechar.
            {!selecionada && " O consolidado soma as academias sem eliminar os repasses entre elas."}
          </p>
        </div>
      ) : (
        <div className={`grid gap-8 ${colunas.length <= 2 ? "min-[1750px]:grid-cols-[auto_1fr]" : ""}`}>
          <TabelaDemonstrativo titulo="Fluxo de caixa" colunas={colunasDemo} linhas={linhasDfc(colunas.map((c) => c.dfc))} />
          <div className="grid content-start gap-8">
            {quadrosIndicadores().map((q) => (
              <QuadroIndicadores key={q.titulo} titulo={q.titulo} itens={q.itens} colunas={colunas} />
            ))}
          </div>
          {colunas.some((c) => Math.abs(c.dfc.diferenca) > 0.01) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 min-[1750px]:col-span-2">O fluxo não bateu com a variação do caixa em algum período: confira se o balancete importado está completo.</p>
          )}
          <p className="text-xs text-slate-500 min-[1750px]:col-span-2">Passe o mouse sobre um indicador para ver como é calculado. Indicadores anuais (ROE e dívida ÷ EBITDA) levam o período a 12 meses.</p>
        </div>
      )}

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          Balancetes ({listaImportados.length} importados em {ano}) · importar novo
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-4">
          <ImportarBalancetes academias={academias.map((a) => ({ id: a.id, nome: a.nome }))} academiaPadrao={selecionada} importar={importarBalancete} />
          {listaImportados.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {listaImportados.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <strong className="font-medium text-slate-800">{nomeAcademia(b.academia_id)}</strong> · {rotuloPeriodo(b.mes_inicio, b.mes_fim, b.ano)}
                    <span className="text-xs text-slate-500"> · {b.arquivo_nome}</span>
                  </span>
                  <BotaoExcluirBalancete id={b.id} rotulo={`${nomeAcademia(b.academia_id)} · ${rotuloPeriodo(b.mes_inicio, b.mes_fim, b.ano)}`} excluir={excluirBalancete} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
