import Link from "next/link";
import type { ReactNode } from "react";
import { contextoAcademias } from "@/lib/contexto";
import { TIPOS_MANUTENCAO } from "@/lib/database.types";
import { ultimoDiaLancado } from "@/lib/painel";
import {
  div,
  formatar,
  formatarDia,
  INDICADORES,
  moeda,
  montarPainel,
  numero,
  type Indicador,
  type VisitantesPorOrigem,
} from "@/lib/painelDados";
import { diasEmAberto } from "@/lib/pendencias";
import { PERIODOS, type OcupacaoProfessor, type Periodo } from "@/lib/ocupacao";
import { ontem } from "@/lib/planilha";
import { PerfilClientes } from "./painel/PerfilClientes";
import { SemAcademias } from "./SemAcademias";

// Painel gerencial: faturamento do dia, do mês e do ano; os principais números do mês; alunos de outras
// unidades; não conversão; indicadores com comparação e o resumo de compras e manutenção.

// Variação: em % para quantidades; em pontos percentuais (p.p.) para taxas. Verde = melhorou, vermelho = piorou.
function Variacao({
  atual,
  anterior,
  indicador,
}: {
  atual: number | null;
  anterior: number | null;
  indicador: Indicador;
}) {
  if (atual === null || anterior === null)
    return <span className="text-slate-400">—</span>;
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

function Cartao({
  titulo,
  valor,
  detalhe,
  destaque,
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${destaque ? "border-marca bg-marca text-white" : "border-slate-200 bg-white"}`}
    >
      <p className={`text-xs ${destaque ? "text-blue-100" : "text-slate-500"}`}>
        {titulo}
      </p>
      <p
        className={`mt-1 font-semibold tabular-nums ${destaque ? "text-2xl" : "text-xl text-slate-900"}`}
      >
        {valor}
      </p>
      {detalhe && (
        <p
          className={`mt-0.5 text-xs ${destaque ? "text-blue-100" : "text-slate-500"}`}
        >
          {detalhe}
        </p>
      )}
    </div>
  );
}

// Cartão com três números (dia, mês e ano) que abre um detalhamento ao clicar.
function CartaoTres({
  titulo,
  valores,
  detalhe,
  children,
}: {
  titulo: string;
  valores: [string, string][];
  detalhe?: string;
  children?: ReactNode;
}) {
  const corpo = (
    <>
      <p className="text-xs text-slate-500">{titulo}</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {valores.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <p className="text-lg font-semibold tabular-nums text-slate-900">
              {valor}
            </p>
            <p className="text-[11px] text-slate-500">{rotulo}</p>
          </div>
        ))}
      </div>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </>
  );
  if (!children)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        {corpo}
      </div>
    );
  return (
    <details className="group rounded-lg border border-slate-200 bg-white p-3 open:col-span-full">
      <summary className="cursor-pointer list-none">
        {corpo}
        <p className="mt-1 text-xs font-medium text-marca group-open:hidden">
          Clique para ver o detalhe
        </p>
      </summary>
      <div className="mt-3 border-t border-slate-100 pt-3">{children}</div>
    </details>
  );
}

function TabelaOrigens({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: VisitantesPorOrigem[];
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold text-slate-700">{titulo}</p>
      {linhas.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nenhuma passagem de outras unidades.
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full min-w-72 text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium">Unidade de origem</th>
                <th className="py-1 text-right font-medium">Passagens</th>
                <th className="py-1 text-right font-medium">Alunos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l) => (
                <tr key={l.unidade_origem}>
                  <td className="py-1">{l.unidade_origem}</td>
                  <td className="py-1 text-right tabular-nums">
                    {numero(l.passagens)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {numero(l.alunos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Motivos({
  titulo,
  motivos,
  total,
}: {
  titulo: string;
  motivos: [string, number][];
  total: number;
}) {
  const maior = Math.max(1, ...motivos.map(([, n]) => n));
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold text-slate-700">
        {titulo} ({numero(total)})
      </p>
      {motivos.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma visita não convertida.</p>
      ) : (
        <ul className="space-y-1.5">
          {motivos.map(([motivo, n]) => (
            <li key={motivo} className="text-xs text-slate-700">
              <div className="flex justify-between gap-2">
                <span className="truncate" title={motivo}>
                  {motivo}
                </span>
                <span className="font-medium tabular-nums">{numero(n)}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-marca"
                  style={{ width: `${(n / maior) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pctOcupacao = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// % de ocupação de cada professor por período (manhã, tarde, noite), com a quantidade de aulas.
function TabelaOcupacao({ professores }: { professores: OcupacaoProfessor[] }) {
  const nomes = [...new Set(professores.map((p) => p.professor))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  if (!nomes.length)
    return (
      <p className="text-xs text-slate-500">
        Sem aulas com contagem de sala no mês.
      </p>
    );
  const periodos = Object.keys(PERIODOS) as Periodo[];
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-72 text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 text-left font-medium">Professor</th>
            {periodos.map((p) => (
              <th key={p} className="py-1 text-right font-medium">
                {PERIODOS[p]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {nomes.map((n) => (
            <tr key={n}>
              <td className="py-1">{n}</td>
              {periodos.map((p) => {
                const x = professores.find(
                  (o) => o.professor === n && o.periodo === p,
                );
                return (
                  <td key={p} className="py-1 text-right tabular-nums">
                    {x ? (
                      <>
                        <strong className="text-slate-900">
                          {pctOcupacao(x.media)}
                        </strong>{" "}
                        <span className="text-slate-400">({x.aulas})</span>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string; data?: string }>;
}) {
  const params = await searchParams;
  const { supabase, academias, admin, selecionada } = await contextoAcademias(
    params.unidade,
  );
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
  const d = await montarPainel(supabase, { unidade, referencia, academias });
  const m = d.mes;
  const ativos = m.ativos_pagantes;
  const adimplentes = ativos !== null ? ativos - (m.inadimplentes ?? 0) : null;
  const { area, custo, inventario } = d.estrutura;
  const ano = referencia.slice(0, 4);

  return (
    <div className="space-y-5">
      {/* Cabeçalho e filtros */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Painel gerencial
          </h1>
          <p className="text-sm text-slate-500">
            {d.unidadeNome} · referência{" "}
            <span className="font-medium text-slate-700">
              {formatarDia(referencia)}
            </span>
          </p>
        </div>
        <form action="/" className="flex flex-wrap items-end gap-3 text-sm">
          {academias.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Unidade</span>
              <select
                name="unidade"
                defaultValue={unidade ?? ""}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
              >
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
            <input
              type="date"
              name="data"
              defaultValue={referencia}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
            />
          </label>
          <button className="rounded-md bg-marca px-3 py-1.5 font-medium text-white hover:bg-marca-escuro">
            Ver
          </button>
        </form>
      </div>

      {d.erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro ao calcular o painel: {d.erro}
        </p>
      )}

      {/* Faturamento: dia, mês e ano (só o administrador vê) */}
      {admin && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Cartao
            destaque
            titulo={`Faturamento do dia (${formatarDia(referencia).slice(0, 5)})`}
            valor={moeda(d.dia.faturamento)}
          />
          <Cartao
            destaque
            titulo="Faturamento acumulado no mês"
            valor={moeda(m.faturamento)}
            detalhe={`${numero(m.dias_lancados)} dias lançados`}
          />
          <Cartao
            destaque
            titulo={`Faturamento acumulado no ano (${ano})`}
            valor={moeda(d.ano.faturamento, 0)}
          />
        </div>
      )}

      {/* Números do mês */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Cartao
          titulo="Vendas no mês"
          valor={numero(m.vendas)}
          detalhe={`ICV ${formatar(div(m.vendas, m.visitas), "percentual")} · ${numero(m.visitas)} visitas`}
        />
        <Cartao
          titulo="Ativos pagantes"
          valor={numero(ativos)}
          detalhe={`Adimplentes: ${numero(adimplentes)}`}
        />
        <Cartao
          titulo="Inadimplentes"
          valor={numero(m.inadimplentes)}
          detalhe={`${formatar(div(m.inadimplentes, ativos), "percentual")} dos ativos`}
        />
        <Cartao
          titulo="Cancelamentos no mês"
          valor={`${numero(m.cancelamentos_efetivados)} efet.`}
          detalhe={`${numero(m.cancelamentos_solicitados)} solicitados · churn ${formatar(div(m.cancelamentos_efetivados, ativos), "percentual")}`}
        />
        <Cartao
          titulo="Alunos por professor na sala (mês)"
          valor={numero(d.medias.alunosPorProfessor, 1)}
          detalhe={
            d.medias.contagensSala
              ? `média de ${numero(d.medias.contagensSala)} contagens`
              : "sem quantidade de professores lançada"
          }
        />
        <Cartao
          titulo="Alunos por professor no pico (mês)"
          valor={numero(d.medias.alunosPorProfessorPico, 1)}
          detalhe={
            d.medias.contagensPico
              ? `seg a sex, 5h–9h e 18h–21h · ${numero(d.medias.contagensPico)} contagens`
              : "seg a sex, 5h–9h e 18h–21h · sem contagens com professores"
          }
        />
        <Cartao
          titulo="Média de alunos por aula coletiva (mês)"
          valor={numero(d.medias.mediaAlunosColetiva, 1)}
          detalhe={`${numero(d.medias.aulasColetivas)} aulas`}
        />
        <Cartao titulo="NPS médio no mês" valor={numero(m.nps, 1)} />
        <Cartao titulo="Passagens no mês" valor={numero(m.passagens)} />
        <Cartao
          titulo="Gympass no mês"
          valor={moeda(m.gympass_valor)}
          detalhe={`${numero(m.gympass)} check-ins · ${numero(d.gympassPessoasMes)} pessoas diferentes`}
        />
        <Cartao
          titulo="Área"
          valor={area ? `${numero(area)} m²` : "—"}
          detalhe={`Aluno/m²: ${numero(div(ativos, area), 2)}`}
        />
        <Cartao
          titulo="Custo financeiro"
          valor={moeda(custo, 0)}
          detalhe={`Custo por aluno: ${moeda(div(custo, ativos))}`}
        />
        <Cartao
          titulo="Inventário"
          valor={`${numero(inventario)} máquinas`}
          detalhe={`Máquinas/aluno: ${numero(div(inventario, ativos), 3)}`}
        />
      </div>

      {/* Outras unidades e não conversão (clicar abre o detalhe) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <CartaoTres
          titulo="Alunos de outras unidades (sem repetir o aluno)"
          valores={[
            ["no dia", numero(d.visitantes.dia.total.alunos)],
            ["no mês", numero(d.visitantes.mes.total.alunos)],
            ["no ano", numero(d.visitantes.ano.total.alunos)],
          ]}
          detalhe={
            d.visitantes.mes.disponivel
              ? undefined
              : "Rode o SQL 0027 para ver este número."
          }
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <TabelaOrigens
              titulo="No mês, por unidade de origem"
              linhas={d.visitantes.mes.porOrigem}
            />
            <TabelaOrigens
              titulo="No ano, por unidade de origem"
              linhas={d.visitantes.ano.porOrigem}
            />
          </div>
        </CartaoTres>
        <CartaoTres
          titulo="Passagens de alunos de outras unidades"
          valores={[
            ["no dia", numero(d.visitantes.dia.total.passagens)],
            ["no mês", numero(d.visitantes.mes.total.passagens)],
            ["no ano", numero(d.visitantes.ano.total.passagens)],
          ]}
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <TabelaOrigens
              titulo="No mês, por unidade de origem"
              linhas={d.visitantes.mes.porOrigem}
            />
            <TabelaOrigens
              titulo="No ano, por unidade de origem"
              linhas={d.visitantes.ano.porOrigem}
            />
          </div>
        </CartaoTres>
        <CartaoTres
          titulo="Visitas não convertidas"
          valores={[
            ["no dia", numero(d.naoConversao.dia.total)],
            ["no mês", numero(d.naoConversao.mes.total)],
            ["no ano", numero(d.naoConversao.ano.total)],
          ]}
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <Motivos
              titulo="Motivos no mês"
              motivos={d.naoConversao.mes.motivos}
              total={d.naoConversao.mes.total}
            />
            <Motivos
              titulo="Motivos no ano"
              motivos={d.naoConversao.ano.motivos}
              total={d.naoConversao.ano.total}
            />
          </div>
        </CartaoTres>
      </div>

      {/* Ocupação das aulas: % de quem estava na academia no horário que estava na aula */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CartaoTres
          titulo="Ocupação das coletivas (% dos alunos da academia no horário da aula)"
          valores={[
            ["no dia", pctOcupacao(d.ocupacao.coletivas.dia)],
            ["no mês", pctOcupacao(d.ocupacao.coletivas.mes)],
          ]}
          detalhe={`média de ${numero(d.ocupacao.coletivas.aulasMes)} aulas no mês`}
        >
          <p className="mb-1 text-xs font-semibold text-slate-700">
            Por professor e período, no mês (entre parênteses, as aulas)
          </p>
          <TabelaOcupacao professores={d.ocupacao.coletivas.professores} />
        </CartaoTres>
        <CartaoTres
          titulo="Ocupação das lutas (% dos alunos da academia no horário da aula)"
          valores={[
            ["no dia", pctOcupacao(d.ocupacao.lutas.dia)],
            ["no mês", pctOcupacao(d.ocupacao.lutas.mes)],
          ]}
          detalhe={`média de ${numero(d.ocupacao.lutas.aulasMes)} aulas no mês`}
        >
          <p className="mb-1 text-xs font-semibold text-slate-700">
            Por professor e período, no mês (entre parênteses, as aulas)
          </p>
          <TabelaOcupacao professores={d.ocupacao.lutas.professores} />
        </CartaoTres>
      </div>

      {/* Perfil dos clientes (cadastro importado em Clientes) */}
      <PerfilClientes
        linhas={d.clientes.linhas}
        disponivel={d.clientes.disponivel}
      />

      {/* Indicadores com comparação */}
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
            {INDICADORES.filter(
              (ind) => admin || ind.rotulo !== "Faturamento",
            ).map((ind) => {
              const [vd, vm, vma, va, vaa] = [
                d.dia,
                d.mes,
                d.mesAnterior,
                d.ano,
                d.anoAnterior,
              ].map((t) => ind.valor(t));
              return (
                <tr key={ind.rotulo} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {ind.rotulo}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatar(vd, ind.formato)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {formatar(vm, ind.formato)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {formatar(vma, ind.formato)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                    <Variacao atual={vm} anterior={vma} indicador={ind} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {formatar(va, ind.formato)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {formatar(vaa, ind.formato)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                    <Variacao atual={va} anterior={vaa} indicador={ind} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          Mês anterior e ano anterior: mesmo trecho do período (até o dia{" "}
          {Number(referencia.slice(8, 10))}). Ativos e inadimplentes: último
          valor lançado no período. Variação em p.p. = pontos percentuais.
        </p>
      </div>

      {/* Resumo de compras e manutenção */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-semibold text-slate-900">
              Compras pendentes
            </p>
            <p className="text-sm text-slate-600">
              {numero(d.pendencias.compras.length)}
              {d.pendencias.comprasAtrasadas > 0 && (
                <span className="ml-2 font-semibold text-red-700">
                  {d.pendencias.comprasAtrasadas} atrasadas
                </span>
              )}
            </p>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {d.pendencias.compras.slice(0, 5).map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">{c.descricao}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {diasEmAberto(c.data_solicitacao)} dias
                </span>
              </li>
            ))}
            {d.pendencias.compras.length === 0 && (
              <li className="py-2 text-slate-500">Nenhuma compra pendente.</li>
            )}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-semibold text-slate-900">
              Manutenções pendentes
            </p>
            <p className="text-sm text-slate-600">
              {numero(d.pendencias.manutencoes.length)}
            </p>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {d.pendencias.manutencoes.slice(0, 5).map((mt) => (
              <li key={mt.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">
                  <span className="text-slate-500">
                    {TIPOS_MANUTENCAO[mt.tipo]} ·{" "}
                  </span>
                  {mt.descricao}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {diasEmAberto(mt.data_inclusao)} dias
                </span>
              </li>
            ))}
            {d.pendencias.manutencoes.length === 0 && (
              <li className="py-2 text-slate-500">
                Nenhuma manutenção pendente.
              </li>
            )}
          </ul>
        </div>
        <p className="text-xs text-slate-500 lg:col-span-2">
          Mais antigas primeiro.{" "}
          <Link
            href={`/relatorios/pendencias${unidade ? `?academia=${unidade}` : ""}`}
            className="text-marca underline"
          >
            Ver o relatório completo de compras e manutenção
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
