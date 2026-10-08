import {
  DESPESAS_OPERACIONAIS,
  GRUPOS_BALANCO,
  somarGrupos,
  totaisBalanco,
  totaisDfc,
  totaisDre,
  type Balanco,
  type ChaveBalanco,
  type ChaveDfc,
  type Dfc,
  type Dre,
  type Grupo,
} from "@/lib/demonstracoes";
import type { LinhaDemo } from "./TabelaDemonstrativo";

// Montagem das linhas dos quadros do fechamento (DRE, balanço, fluxo de caixa) a partir das demonstrações.

export type Pacote = { rotulo: string; detalhe?: string; meses: number; dre: Dre; balancoFim: Balanco; balancoInicio: Balanco; dfc: Dfc };

// Junta vários períodos (mesma academia, em sequência) ou várias academias numa coluna só.
export function juntar(pacotes: Omit<Pacote, "rotulo" | "detalhe">[], rotulo: string, detalhe?: string, mesmaEmpresa = true): Pacote {
  const dre = totaisDre(somarGrupos(pacotes.map((p) => p.dre.grupos)));
  const balancoFim = mesmaEmpresa ? pacotes[pacotes.length - 1].balancoFim : totaisBalanco(somarGrupos(pacotes.map((p) => p.balancoFim.grupos)));
  const balancoInicio = mesmaEmpresa ? pacotes[0].balancoInicio : totaisBalanco(somarGrupos(pacotes.map((p) => p.balancoInicio.grupos)));
  const caixaInicial = mesmaEmpresa ? pacotes[0].dfc.caixaInicial : pacotes.reduce((t, p) => t + p.dfc.caixaInicial, 0);
  const caixaFinal = mesmaEmpresa ? pacotes[pacotes.length - 1].dfc.caixaFinal : pacotes.reduce((t, p) => t + p.dfc.caixaFinal, 0);
  const dfc = totaisDfc(somarGrupos(pacotes.map((p) => p.dfc.grupos)), caixaInicial, caixaFinal);
  return { rotulo, detalhe, meses: mesmaEmpresa ? pacotes.reduce((t, p) => t + p.meses, 0) : Math.max(...pacotes.map((p) => p.meses)), dre, balancoFim, balancoInicio, dfc };
}

// Uma linha de grupo, com as contas da contabilidade por baixo (abrem ao clicar).
export function linhaGrupo(rotulo: string, grupos: Grupo[], opcoes: Partial<LinhaDemo> = {}): LinhaDemo {
  const descricoes = [...new Set(grupos.flatMap((g) => g.contas.map((c) => c.descricao)))];
  return {
    rotulo,
    valores: grupos.map((g) => g.valor),
    filhos: descricoes.map((d) => ({ rotulo: d, valores: grupos.map((g) => g.contas.filter((c) => c.descricao === d).reduce((t, c) => t + c.valor, 0)) })),
    ...opcoes,
  };
}
const temValor = (l: LinhaDemo) => l.valores.some((v) => v !== null && Math.abs(v) >= 0.005);
const so = (l: LinhaDemo) => (temValor(l) ? [l] : []);

export function linhasDre(p: Pacote[]): LinhaDemo[] {
  const g = (c: keyof Dre["grupos"]) => p.map((x) => x.dre.grupos[c]);
  const total = (rotulo: string, f: (d: Dre) => number, forte = false): LinhaDemo => ({ rotulo, forte, valores: p.map((x) => f(x.dre)) });
  const depreciacao = linhaGrupo("Depreciação e amortização", g("depreciacao"), { nivel: 1 });
  return [
    linhaGrupo("Receita de serviços", g("receita")),
    linhaGrupo("Tributos sobre receitas", g("deducoes"), { nivel: 1 }),
    total("Receita líquida", (d) => d.receitaLiquida, true),
    total("Despesas operacionais", (d) => d.despesasOperacionais),
    ...DESPESAS_OPERACIONAIS.flatMap((c) => so(linhaGrupo(p[0].dre.grupos[c].rotulo, g(c), { nivel: 1 }))),
    total("Resultado operacional (EBITDA)", (d) => d.ebitda, true),
    // Sem depreciação lançada (decisão do Bruno), a linha e o EBIT só aparecem se a contabilidade lançar.
    ...(temValor(depreciacao) ? [depreciacao, total("Resultado depois da depreciação (EBIT)", (d) => d.ebit)] : []),
    total("Resultado financeiro", (d) => d.resultadoFinanceiro + d.grupos.outras.valor),
    ...so(linhaGrupo("Receitas financeiras", g("receitas_financeiras"), { nivel: 1 })),
    ...so(linhaGrupo("Despesas financeiras", g("despesas_financeiras"), { nivel: 1 })),
    ...so(linhaGrupo("Outras receitas e despesas", g("outras"), { nivel: 1 })),
    total("Lucro antes do IR e CS", (d) => d.lair),
    linhaGrupo("Imposto de renda e contribuição social", g("ir_cs"), { nivel: 1 }),
    total("Lucro líquido do período", (d) => d.lucro, true),
  ];
}

// Quadros do balanço: um por bloco (ativo circulante, passivo circulante...).
export function quadroBalanco(bloco: string, balancos: Balanco[], total: (b: Balanco) => number): LinhaDemo[] {
  return [
    ...GRUPOS_BALANCO.filter((g) => g.bloco === bloco).flatMap((g) => so(linhaGrupo(g.rotulo, balancos.map((b) => b.grupos[g.chave as ChaveBalanco])))),
    { rotulo: `Total do ${bloco.toLowerCase()}`, forte: true, valores: balancos.map(total) },
  ];
}

export function linhasDfc(d: Dfc[]): LinhaDemo[] {
  const g = (c: ChaveDfc, opcoes: Partial<LinhaDemo> = { nivel: 1 }) => linhaGrupo(d[0].grupos[c].rotulo, d.map((x) => x.grupos[c]), opcoes);
  const soma = (cs: ChaveDfc[]) => d.map((x) => cs.reduce((t, c) => t + x.grupos[c].valor, 0));
  const giro: ChaveDfc[] = ["receber", "creditos", "fornecedores", "pessoal", "impostos", "adiantamentos_clientes"];
  return [
    { rotulo: "Lucro líquido do período", valores: d.map((x) => x.grupos.lucro.valor) },
    ...so(g("depreciacao")),
    { rotulo: "Variação do capital de giro", valores: soma(giro) },
    ...giro.flatMap((c) => so(g(c))),
    { rotulo: "Caixa gerado pela operação", forte: true, valores: d.map((x) => x.operacional) },
    { rotulo: "Investimentos", valores: d.map((x) => x.investimento) },
    ...so(g("imobilizado")),
    ...so(g("investimentos")),
    { rotulo: "Caixa livre", forte: true, valores: d.map((x) => x.operacional + x.investimento) },
    { rotulo: "Bancos e sócios", valores: d.map((x) => x.financiamento) },
    ...so(g("emprestimos")),
    ...so(g("socios")),
    ...so(g("distribuicao")),
    { rotulo: "Variação do caixa", forte: true, valores: d.map((x) => x.variacaoCaixa) },
    { rotulo: "Caixa no início", nivel: 1, valores: d.map((x) => x.caixaInicial) },
    { rotulo: "Caixa no fim", nivel: 1, valores: d.map((x) => x.caixaFinal) },
  ];
}
