import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import type { LinhaBalancete } from "@/lib/balancete";
import { contextoAcademias } from "@/lib/contexto";
import {
  DESPESAS_OPERACIONAIS,
  GRUPOS_BALANCO,
  GRUPOS_DFC,
  montarBalanco,
  montarDfc,
  montarDre,
  somarGrupos,
  totaisBalanco,
  totaisDfc,
  totaisDre,
  type Balanco,
  type Dfc,
  type Dre,
  type Grupo,
} from "@/lib/demonstracoes";
import { nomeMes, rotuloPeriodo } from "@/lib/nomeBalancete";
import { hoje } from "@/lib/planilha";
import { SemAcademias } from "../../SemAcademias";
import { excluirBalancete, importarBalancete } from "./actions";
import { BotaoExcluirBalancete } from "./BotaoExcluirBalancete";
import { ImportarBalancetes } from "./ImportarBalancetes";
import { TabelaDemonstrativo, type ColunaDemo, type LinhaDemo } from "./TabelaDemonstrativo";

// Fechamento mensal (menu Financeiro): DRE, balanço patrimonial, DFC e indicadores a partir dos balancetes da
// contabilidade. Uma academia: uma coluna por período importado no ano, o acumulado do ano e o ano anterior.
// "Todas": o acumulado do ano de cada academia e o consolidado (sem eliminar as operações entre as academias).

type Balancete = { id: string; academia_id: string; ano: number; mes_inicio: number; mes_fim: number; arquivo_nome: string; importado_em: string };
type Pacote = { rotulo: string; detalhe?: string; meses: number; dre: Dre; balancoFim: Balanco; balancoInicio: Balanco; dfc: Dfc };

const ABAS = { dre: "DRE", balanco: "Balanço patrimonial", dfc: "Fluxo de caixa (DFC) e indicadores" } as const;
type Aba = keyof typeof ABAS;
const curto = (m: number) => nomeMes(m).slice(0, 3);
const rotuloCurto = (b: Pick<Balancete, "mes_inicio" | "mes_fim">) => (b.mes_inicio === b.mes_fim ? nomeMes(b.mes_inicio) : `${curto(b.mes_inicio)} a ${curto(b.mes_fim)}`);

// Junta vários períodos (ou academias) numa coluna só.
function juntar(pacotes: Omit<Pacote, "rotulo" | "detalhe">[], rotulo: string, detalhe?: string, mesmaEmpresa = true): Pacote {
  const dre = totaisDre(somarGrupos(pacotes.map((p) => p.dre.grupos)));
  // Mesma academia em sequência: o balanço do fim é o do último período e o do início, o do primeiro.
  // Várias academias: soma dos balanços.
  const balancoFim = mesmaEmpresa ? pacotes[pacotes.length - 1].balancoFim : totaisBalanco(somarGrupos(pacotes.map((p) => p.balancoFim.grupos)));
  const balancoInicio = mesmaEmpresa ? pacotes[0].balancoInicio : totaisBalanco(somarGrupos(pacotes.map((p) => p.balancoInicio.grupos)));
  const caixaInicial = mesmaEmpresa ? pacotes[0].dfc.caixaInicial : pacotes.reduce((t, p) => t + p.dfc.caixaInicial, 0);
  const caixaFinal = mesmaEmpresa ? pacotes[pacotes.length - 1].dfc.caixaFinal : pacotes.reduce((t, p) => t + p.dfc.caixaFinal, 0);
  const dfc = totaisDfc(somarGrupos(pacotes.map((p) => p.dfc.grupos)), caixaInicial, caixaFinal);
  return { rotulo, detalhe, meses: mesmaEmpresa ? pacotes.reduce((t, p) => t + p.meses, 0) : Math.max(...pacotes.map((p) => p.meses)), dre, balancoFim, balancoInicio, dfc };
}

// Linhas de uma demonstração: um grupo por linha (com as contas por baixo) e os totais.
function linhaGrupo(rotulo: string, grupos: Grupo[], sinal = 1): LinhaDemo {
  const descricoes = [...new Set(grupos.flatMap((g) => g.contas.map((c) => c.descricao)))];
  return {
    rotulo,
    tipo: "grupo",
    valores: grupos.map((g) => g.valor * sinal),
    filhos: descricoes.map((d) => ({ rotulo: d, valores: grupos.map((g) => (g.contas.filter((c) => c.descricao === d).reduce((t, c) => t + c.valor, 0) || 0) * sinal) })),
  };
}
const temValor = (l: LinhaDemo) => l.valores.some((v) => v !== null && Math.abs(v) >= 0.005);

function linhasDre(p: Pacote[]): LinhaDemo[] {
  const g = (c: keyof Dre["grupos"]) => p.map((x) => x.dre.grupos[c]);
  const total = (rotulo: string, f: (d: Dre) => number, tipo: LinhaDemo["tipo"] = "total"): LinhaDemo => ({ rotulo, tipo, valores: p.map((x) => f(x.dre)) });
  const despesas = DESPESAS_OPERACIONAIS.map((c) => linhaGrupo(p[0].dre.grupos[c].rotulo, g(c))).filter(temValor);
  return [
    linhaGrupo("Receita bruta de serviços", g("receita")),
    linhaGrupo("(-) Tributos e cancelamentos sobre a receita", g("deducoes")),
    total("Receita líquida", (d) => d.receitaLiquida),
    { rotulo: "Despesas operacionais", tipo: "secao", valores: [] },
    ...despesas,
    total("Total das despesas operacionais", (d) => d.despesasOperacionais),
    total("Resultado operacional (EBITDA)", (d) => d.ebitda, "resultado"),
    // Sem depreciação (decisão do Bruno: não se faz), as linhas de depreciação e EBIT só aparecem se a contabilidade lançar.
    ...(temValor(linhaGrupo("", g("depreciacao"))) ? [linhaGrupo("(-) Depreciação e amortização", g("depreciacao")), total("Resultado operacional depois da depreciação (EBIT)", (d) => d.ebit)] : []),
    { rotulo: "Resultado financeiro e outros", tipo: "secao", valores: [] },
    ...[linhaGrupo("Receitas financeiras", g("receitas_financeiras")), linhaGrupo("Despesas financeiras (juros, tarifas, IOF, multas)", g("despesas_financeiras")), linhaGrupo("Outras receitas e despesas", g("outras"))].filter(temValor),
    total("Resultado antes do IR e da CS", (d) => d.lair),
    linhaGrupo("(-) Imposto de renda e contribuição social", g("ir_cs")),
    total("Lucro líquido do período", (d) => d.lucro, "resultado"),
  ];
}

function linhasBalanco(balancos: Balanco[]): LinhaDemo[] {
  const linhas: LinhaDemo[] = [];
  const blocos = [...new Set(GRUPOS_BALANCO.map((g) => g.bloco))];
  const totalBloco: Record<string, (b: Balanco) => number> = {
    "Ativo circulante": (b) => b.ativoCirculante,
    "Ativo não circulante": (b) => b.ativoNaoCirculante,
    "Passivo circulante": (b) => b.passivoCirculante,
    "Passivo não circulante": (b) => b.passivoNaoCirculante,
    "Patrimônio líquido": (b) => b.patrimonio,
  };
  for (const bloco of blocos) {
    linhas.push({ rotulo: bloco, tipo: "secao", valores: [] });
    for (const g of GRUPOS_BALANCO.filter((x) => x.bloco === bloco)) {
      const l = linhaGrupo(g.rotulo, balancos.map((b) => b.grupos[g.chave]));
      if (temValor(l)) linhas.push(l);
    }
    linhas.push({ rotulo: `Total do ${bloco.toLowerCase()}`, tipo: "total", valores: balancos.map(totalBloco[bloco]) });
    if (bloco === "Ativo não circulante") linhas.push({ rotulo: "TOTAL DO ATIVO", tipo: "resultado", valores: balancos.map((b) => b.ativo) });
  }
  linhas.push({ rotulo: "TOTAL DO PASSIVO E PATRIMÔNIO LÍQUIDO", tipo: "resultado", valores: balancos.map((b) => b.passivo) });
  return linhas;
}

function linhasDfc(dfcs: Dfc[]): LinhaDemo[] {
  const linhas: LinhaDemo[] = [];
  const atividades = [
    { chave: "operacional", rotulo: "Atividades operacionais", total: "Caixa gerado pela operação", f: (d: Dfc) => d.operacional },
    { chave: "investimento", rotulo: "Atividades de investimento", total: "Caixa aplicado em investimentos", f: (d: Dfc) => d.investimento },
    { chave: "financiamento", rotulo: "Atividades de financiamento (bancos e sócios)", total: "Caixa dos financiamentos e dos sócios", f: (d: Dfc) => d.financiamento },
  ];
  for (const a of atividades) {
    linhas.push({ rotulo: a.rotulo, tipo: "secao", valores: [] });
    for (const g of GRUPOS_DFC.filter((x) => x.atividade === a.chave)) {
      const l = linhaGrupo(g.rotulo, dfcs.map((d) => d.grupos[g.chave]));
      if (temValor(l) || g.chave === "lucro") linhas.push(l);
    }
    linhas.push({ rotulo: a.total, tipo: "total", valores: dfcs.map(a.f) });
  }
  linhas.push(
    { rotulo: "Caixa livre (operação − investimentos)", tipo: "resultado", valores: dfcs.map((d) => d.operacional + d.investimento) },
    { rotulo: "Variação do caixa no período", tipo: "total", valores: dfcs.map((d) => d.variacaoCaixa) },
    { rotulo: "Caixa, bancos e aplicações no início", tipo: "grupo", valores: dfcs.map((d) => d.caixaInicial) },
    { rotulo: "Caixa, bancos e aplicações no fim", tipo: "total", valores: dfcs.map((d) => d.caixaFinal) }
  );
  return linhas;
}

// Indicadores de cada coluna (acumulados): rentabilidade, liquidez, endividamento e caixa.
function indicadores() {
  const r = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pc = (v: number) => (Number.isFinite(v) ? `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
  const x = (v: number) => (Number.isFinite(v) ? `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
  const div = (a: number, b: number) => (Math.abs(b) < 0.005 ? NaN : a / b);
  type Ind = { rotulo: string; explicacao: string; valor: (p: Pacote) => string };
  const lista: { grupo: string; itens: Ind[] }[] = [
    {
      grupo: "Resultado",
      itens: [
        { rotulo: "Receita bruta média por mês", explicacao: "Receita bruta ÷ meses do período", valor: (q) => r(div(q.dre.receitaBruta, q.meses)) },
        { rotulo: "Margem EBITDA", explicacao: "EBITDA ÷ receita bruta", valor: (q) => pc(div(q.dre.ebitda, q.dre.receitaBruta)) },
        { rotulo: "Margem líquida", explicacao: "Lucro líquido ÷ receita bruta", valor: (q) => pc(div(q.dre.lucro, q.dre.receitaBruta)) },
        { rotulo: "Peso da ocupação", explicacao: "Aluguel, condomínio, IPTU, energia, água e gás ÷ receita bruta", valor: (q) => pc(div(-q.dre.grupos.ocupacao.valor, q.dre.receitaBruta)) },
        { rotulo: "Peso do pessoal", explicacao: "Pessoal e encargos ÷ receita bruta", valor: (q) => pc(div(-q.dre.grupos.pessoal.valor, q.dre.receitaBruta)) },
        {
          rotulo: "Retorno sobre o patrimônio (ROE, ao ano)",
          explicacao: "Lucro do período levado a 12 meses ÷ patrimônio líquido médio",
          valor: (q) => pc(div((q.dre.lucro * 12) / q.meses, (q.balancoInicio.patrimonio + q.balancoFim.patrimonio) / 2)),
        },
      ],
    },
    {
      grupo: "Caixa",
      itens: [
        { rotulo: "Caixa gerado pela operação", explicacao: "Lucro + depreciação ± capital de giro (DFC)", valor: (q) => r(q.dfc.operacional) },
        { rotulo: "Investimentos (equipamentos e benfeitorias)", explicacao: "Compras de imobilizado e intangível", valor: (q) => r(q.dfc.investimento) },
        { rotulo: "Caixa livre", explicacao: "Operação − investimentos: o que sobra para sócios e dívidas", valor: (q) => r(q.dfc.operacional + q.dfc.investimento) },
        { rotulo: "Conversão do EBITDA em caixa", explicacao: "Caixa da operação ÷ EBITDA", valor: (q) => pc(div(q.dfc.operacional, q.dre.ebitda)) },
        { rotulo: "Distribuição e movimentos com sócios", explicacao: "Distribuição de lucros + sócios e empresas do grupo (DFC)", valor: (q) => r(q.dfc.grupos.distribuicao.valor + q.dfc.grupos.socios.valor) },
        { rotulo: "Prazo médio de recebimento", explicacao: "Contas a receber ÷ receita bruta diária", valor: (q) => `${Math.round(div(q.balancoFim.grupos.receber.valor, q.dre.receitaBruta / (q.meses * 30))) || 0} dias` },
      ],
    },
    {
      grupo: "Liquidez e endividamento (no fim do período)",
      itens: [
        { rotulo: "Liquidez corrente", explicacao: "Ativo circulante ÷ passivo circulante", valor: (q) => x(div(q.balancoFim.ativoCirculante, q.balancoFim.passivoCirculante)) },
        {
          rotulo: "Liquidez corrente sem sócios e grupo",
          explicacao: "Tira do ativo os adiantamentos a sócios e empresas do grupo, que não viram caixa da operação",
          valor: (q) => x(div(q.balancoFim.ativoCirculante - q.balancoFim.grupos.socios_ativo.valor, q.balancoFim.passivoCirculante)),
        },
        { rotulo: "Liquidez imediata", explicacao: "Caixa, bancos e aplicações ÷ passivo circulante", valor: (q) => x(div(q.balancoFim.grupos.disponivel.valor, q.balancoFim.passivoCirculante)) },
        { rotulo: "Endividamento geral", explicacao: "(Passivo circulante + não circulante) ÷ ativo total", valor: (q) => pc(div(q.balancoFim.passivoCirculante + q.balancoFim.passivoNaoCirculante, q.balancoFim.ativo)) },
        {
          rotulo: "Dívida bancária líquida",
          explicacao: "Empréstimos, financiamentos e saldo negativo − caixa",
          valor: (q) => r(q.balancoFim.grupos.emprestimos_cp.valor + q.balancoFim.grupos.emprestimos_lp.valor - q.balancoFim.grupos.disponivel.valor),
        },
        {
          rotulo: "Dívida líquida ÷ EBITDA (anual)",
          explicacao: "Quantos anos de EBITDA pagam a dívida bancária líquida (negativo = caixa maior que a dívida)",
          valor: (q) => x(div(q.balancoFim.grupos.emprestimos_cp.valor + q.balancoFim.grupos.emprestimos_lp.valor - q.balancoFim.grupos.disponivel.valor, (q.dre.ebitda * 12) / q.meses)),
        },
      ],
    },
  ];
  return lista;
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
  const aba: Aba = typeof params.aba === "string" && params.aba in ABAS ? (params.aba as Aba) : "dre";
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

  // Um pacote por balancete (DRE do período, balanços do início e do fim, DFC).
  const pacoteDe = (b: Balancete): Omit<Pacote, "rotulo" | "detalhe"> => {
    const l = linhas.filter((x) => x.balancete_id === b.id);
    return { meses: b.mes_fim - b.mes_inicio + 1, dre: montarDre(l), balancoFim: montarBalanco(l, "atual"), balancoInicio: montarBalanco(l, "anterior"), dfc: montarDfc(l) };
  };
  const doAno = (academia: string, a: number) => usados.filter((b) => b.academia_id === academia && b.ano === a).sort((x, y) => x.mes_inicio - y.mes_inicio);
  const meses = (lista: Balancete[]) => (lista.length ? `${curto(lista[0].mes_inicio)} a ${curto(lista[lista.length - 1].mes_fim)}` : "");

  let colunas: Pacote[] = [];
  if (selecionada) {
    const atuais = doAno(selecionada, ano);
    const anteriores = doAno(selecionada, ano - 1);
    colunas = atuais.map((b) => ({ ...pacoteDe(b), rotulo: rotuloCurto(b), detalhe: String(ano) }));
    if (atuais.length > 1) colunas.push(juntar(atuais.map(pacoteDe), `Acumulado ${ano}`, meses(atuais)));
    if (anteriores.length) colunas.push(juntar(anteriores.map(pacoteDe), String(ano - 1), meses(anteriores)));
  } else {
    const porAcademia = academias
      .map((a) => ({ a, lista: doAno(a.id, ano) }))
      .filter((x) => x.lista.length)
      .map((x) => juntar(x.lista.map(pacoteDe), x.a.nome, meses(x.lista)));
    colunas = porAcademia;
    if (porAcademia.length > 1) colunas.push(juntar(porAcademia, `Consolidado ${ano}`, "soma das academias", false));
  }
  const semAno = colunas.length === 0;

  const link = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const atual = { academia: selecionada, ano: String(ano), aba, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v && !(k === "aba" && v === "dre")) q.set(k, v);
    return `/financeiro/fechamento?${q.toString()}`;
  };
  const colunasDemo: ColunaDemo[] = colunas.map((c) => ({ rotulo: c.rotulo, detalhe: c.detalhe }));
  const listaImportados = balancetes.filter((b) => b.ano === ano).sort((x, y) => nomeAcademia(x.academia_id).localeCompare(nomeAcademia(y.academia_id)) || x.mes_inicio - y.mes_inicio);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">BFIT · Financeiro</p>
          <h1 className="text-lg font-semibold text-slate-900">Fechamento mensal</h1>
          <p className="text-sm text-slate-600">{selecionada ? nomeAcademia(selecionada) : "Todas as academias"} · {ano}</p>
        </div>
        {anos.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Ano:</span>
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

      <div className="flex flex-wrap gap-2">
        {(Object.entries(ABAS) as [Aba, string][]).map(([k, rotulo]) => (
          <Link key={k} href={link({ aba: k })} aria-current={k === aba ? "page" : undefined} className={`rounded-full px-3 py-1 text-sm ${k === aba ? "bg-marca font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {rotulo}
          </Link>
        ))}
      </div>

      {semAno ? (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Nenhum balancete importado {selecionada ? `de ${nomeAcademia(selecionada)} ` : ""}em {ano}. Importe abaixo.</p>
      ) : aba === "dre" ? (
        <section className="space-y-2">
          <TabelaDemonstrativo colunas={colunasDemo} linhas={linhasDre(colunas)} base={colunas.map((c) => c.dre.receitaBruta)} />
          <p className="text-xs text-slate-500">
            Clique numa linha para ver as contas da contabilidade. % sobre a receita bruta. As contas são classificadas pelo nome
            (o mesmo código tem nomes diferentes em cada academia).
            {!selecionada && " O consolidado soma as academias sem eliminar os repasses entre elas."}
          </p>
        </section>
      ) : aba === "balanco" ? (
        <section className="space-y-2">
          {(() => {
            const balancos = selecionada ? [colunas[0].balancoInicio, ...colunas.map((c) => c.balancoFim)] : colunas.map((c) => c.balancoFim);
            const cols: ColunaDemo[] = selecionada
              ? [{ rotulo: `Início de ${ano}`, detalhe: "saldo de abertura" }, ...colunas.map((c) => ({ rotulo: `Fim de ${c.rotulo}`, detalhe: c.detalhe }))]
              : colunasDemo.map((c) => ({ ...c, detalhe: `fim de ${c.detalhe}` }));
            return <TabelaDemonstrativo colunas={cols} linhas={linhasBalanco(balancos)} />;
          })()}
          <p className="text-xs text-slate-500">
            O resultado do ano ainda não encerrado pela contabilidade entra no patrimônio líquido, para o balanço fechar. O
            adiantamento do Gympass é receita recebida antes de prestar o serviço (passivo). Os adiantamentos a sócios e a
            empresas do grupo ficam separados porque não são caixa da operação.
          </p>
        </section>
      ) : (
        <section className="space-y-5">
          <TabelaDemonstrativo colunas={colunasDemo} linhas={linhasDfc(colunas.map((c) => c.dfc))} />
          {colunas.some((c) => Math.abs(c.dfc.diferenca) > 0.01) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">O fluxo não bateu com a variação do caixa em algum período: confira se o balancete importado está completo.</p>
          )}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Indicadores</h2>
            <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Indicador</th>
                    {colunas.map((c) => (
                      <th key={c.rotulo} className="px-3 py-2 text-right font-semibold">
                        {c.rotulo}
                        {c.detalhe && <span className="block font-normal text-slate-500">{c.detalhe}</span>}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold">Como é calculado</th>
                  </tr>
                </thead>
                <tbody>
                  {indicadores().map((g) => [
                    <tr key={g.grupo} className="border-t border-slate-200 bg-slate-50/60">
                      <td colSpan={colunas.length + 2} className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-marca">
                        {g.grupo}
                      </td>
                    </tr>,
                    ...g.itens.map((i) => (
                      <tr key={i.rotulo} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-800">{i.rotulo}</td>
                        {colunas.map((c) => (
                          <td key={c.rotulo} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                            {i.valor(c)}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-xs text-slate-500">{i.explicacao}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <ImportarBalancetes academias={academias.map((a) => ({ id: a.id, nome: a.nome }))} academiaPadrao={selecionada} importar={importarBalancete} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Balancetes importados em {ano}</h2>
        {listaImportados.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
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
      </section>
    </div>
  );
}
