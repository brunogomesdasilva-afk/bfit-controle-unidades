import Link from "next/link";
import { Fragment } from "react";
import {
  NOTAS,
  PERGUNTAS_ABERTAS,
  QUESTIONARIOS,
  type Avaliacao,
  type Questionario,
} from "@/lib/adb";
import { contextoAcademias } from "@/lib/contexto";
import { type Funcionario } from "@/lib/database.types";
import { hoje } from "@/lib/planilha";
import { AbasAcademias } from "../../AbasAcademias";
import { SemAcademias } from "../../SemAcademias";
import { excluirAvaliacao } from "./actions";
import { ExcluirAvaliacao } from "./ExcluirAvaliacao";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const nota = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const media = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null);

function corDaNota(n: number | null) {
  if (n === null) return "";
  if (n >= 4.5) return "text-emerald-700";
  if (n >= 3.5) return "text-slate-900";
  if (n >= 2.5) return "text-amber-700";
  return "text-red-700";
}

// A.D.B: grupos (recepção e professores) com a média geral; ao abrir, cada funcionário com a média; ao
// clicar no nome, o detalhamento: uma linha por avaliação (mês), uma coluna por item (nome reduzido) e a
// média no fim. A descrição completa de cada item só aparece no formulário da avaliação.
export default async function AdbPage({ searchParams }: { searchParams: Promise<{ academia?: string; mes?: string }> }) {
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(params.academia);
  const mesAtual = hoje().slice(0, 7);

  // Todas as avaliações (da academia da aba ou de todas): alimentam o resumo por grupo e o histórico.
  let consultaTodas = supabase.from("avaliacoes_adb").select("*").order("mes", { ascending: false });
  if (selecionada) consultaTodas = consultaTodas.eq("academia_id", selecionada);
  const todas = ((await consultaTodas).data ?? []) as Avaliacao[];
  const mesDe = (a: Avaliacao) => String(a.mes).slice(0, 7);
  const mesesAvaliados = [...new Set(todas.map(mesDe))];

  // Mês escolhido no filtro; sem mês, o resumo usa a última avaliação de cada funcionário.
  const mesEscolhido = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : null;

  const idsFuncionarios = [...new Set(todas.map((a) => a.funcionario_id))];
  const idsAvaliadores = [...new Set(todas.flatMap((a) => [a.criado_por, a.atualizado_por]).filter(Boolean))] as string[];
  const [{ data: funcionarios }, { data: perfis }] = await Promise.all([
    idsFuncionarios.length ? supabase.from("funcionarios").select("*").in("id", idsFuncionarios) : Promise.resolve({ data: [] }),
    idsAvaliadores.length ? supabase.from("profiles").select("id, nome").in("id", idsAvaliadores) : Promise.resolve({ data: [] }),
  ]);
  const funcionarioPorId = new Map(((funcionarios ?? []) as Funcionario[]).map((f) => [f.id, f]));
  const nomeAvaliador = new Map((perfis ?? []).map((p) => [p.id as string, p.nome as string]));
  const nomeAcademia = new Map(academias.map((a) => [a.id, a.nome]));

  // Resumo por grupo: a avaliação de cada funcionário no mês escolhido (ou a última dele) e o histórico.
  const grupos = (["recepcao", "professores"] as Questionario[]).map((q) => {
    const doGrupo = todas.filter((a) => a.questionario === q);
    const pessoas = [...new Set(doGrupo.map((a) => a.funcionario_id))]
      .map((id) => {
        const historico = doGrupo.filter((a) => a.funcionario_id === id); // do mês mais recente ao mais antigo
        const exibida = mesEscolhido ? historico.find((a) => mesDe(a) === mesEscolhido) : historico[0];
        return { id, funcionario: funcionarioPorId.get(id), historico, exibida };
      })
      .filter((p): p is typeof p & { exibida: Avaliacao } => Boolean(p.exibida))
      .sort((a, b) => (a.funcionario?.nome ?? "").localeCompare(b.funcionario?.nome ?? "", "pt-BR"));
    return {
      q,
      nome: q === "recepcao" ? "Recepcionistas" : "Professores",
      pessoas,
      media: media(pessoas.map((p) => Number(p.exibida.media))),
    };
  });

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">A.D.B · Avaliação de desempenho</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Avaliação mensal de cada funcionário, com os questionários de Professores e de Recepção. Conceitos: 5 = Excelente,
        4 = Bom, 3 = Regular, 2 = Ruim, 1 = Péssimo.
      </p>

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <AbasAcademias academias={academias} selecionada={selecionada} caminho="/avaliacao/adb" />

          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <form action="/avaliacao/adb" className="flex items-center gap-2">
              {selecionada && <input type="hidden" name="academia" value={selecionada} />}
              <label htmlFor="mes-adb" className="text-slate-500">
                Mês:
              </label>
              <select
                id="mes-adb"
                name="mes"
                defaultValue={mesEscolhido ?? ""}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 capitalize"
              >
                <option value="">Última avaliação de cada um</option>
                {mesesAvaliados.map((x) => (
                  <option key={x} value={x}>
                    {nomeDoMes(x)}
                  </option>
                ))}
              </select>
              <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Ver</button>
            </form>
            {selecionada ? (
              <Link
                href={`/avaliacao/adb/nova?academia=${selecionada}`}
                className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
              >
                + Nova avaliação ({nomeDoMes(mesAtual)})
              </Link>
            ) : (
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-600">
                Visão de todas as academias: só consulta. Para avaliar, abra a aba da academia.
              </span>
            )}
          </div>

          {/* Resumo: cada grupo com a média geral; ao abrir, cada funcionário com a média; ao abrir o funcionário, o histórico. */}
          <div className="mb-8 space-y-3">
            {grupos.map((g) => (
              <details key={g.q} className="group rounded-lg border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <span className="text-slate-400 transition group-open:rotate-90">›</span>
                    {g.nome}
                    <span className="text-sm font-normal text-slate-500">
                      ({g.pessoas.length} {g.pessoas.length === 1 ? "avaliado" : "avaliados"})
                    </span>
                  </span>
                  <span className="text-sm text-slate-500">
                    Média geral{" "}
                    <span className={`ml-1 text-lg font-semibold tabular-nums ${corDaNota(g.media)}`}>{nota(g.media)}</span>
                  </span>
                </summary>
                <div className="border-t border-slate-100 px-2 py-2">
                  {g.pessoas.length === 0 && (
                    <p className="px-2 py-3 text-sm text-slate-500">
                      Nenhuma avaliação {mesEscolhido ? `em ${nomeDoMes(mesEscolhido)}` : "ainda"}.
                    </p>
                  )}
                  {g.pessoas.map((p) => (
                    <details key={p.id} className="group/pessoa rounded-md open:bg-slate-50 hover:bg-slate-50">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-slate-400 transition group-open/pessoa:rotate-90">›</span>
                          <span className="font-medium text-slate-900">{p.funcionario?.nome ?? "—"}</span>
                          {!selecionada && <span className="text-slate-500">· {nomeAcademia.get(p.exibida.academia_id)}</span>}
                        </span>
                        <span className="text-slate-500">
                          <span className="capitalize">{nomeDoMes(mesDe(p.exibida))}</span>
                          <span className={`ml-3 font-semibold tabular-nums ${corDaNota(Number(p.exibida.media))}`}>
                            {nota(p.exibida.media)}
                          </span>
                        </span>
                      </summary>
                      <div className="overflow-auto px-2 pb-3">
                        <table className="w-full border-collapse text-xs">
                          <thead className="bg-slate-100 font-semibold text-slate-600">
                            <tr>
                              <th className="border border-slate-200 px-2 py-1 text-left uppercase">Mês</th>
                              <th className="border border-slate-200 px-2 py-1 text-left uppercase">Avaliador</th>
                              {QUESTIONARIOS[g.q].perguntas.map((pergunta, i) => (
                                <th key={pergunta.curto} className="border border-slate-200 px-2 py-1 text-center">
                                  {i + 1}. {pergunta.curto}
                                </th>
                              ))}
                              <th className="border border-slate-200 bg-slate-200 px-2 py-1 text-center uppercase">Média</th>
                              {(admin || selecionada) && <th className="border border-slate-200 px-2 py-1" />}
                            </tr>
                          </thead>
                          <tbody>
                            {p.historico.map((a) => {
                              const comentarios = PERGUNTAS_ABERTAS.filter((x) => a[x.campo]);
                              const alteravel = mesDe(a) === mesAtual && Boolean(selecionada);
                              return (
                                <Fragment key={a.id}>
                                  <tr className={a.id === p.exibida.id ? "bg-white font-semibold" : "bg-white"}>
                                    <td className="border border-slate-200 px-2 py-1 capitalize">{nomeDoMes(mesDe(a))}</td>
                                    <td className="border border-slate-200 px-2 py-1 font-normal">
                                      {nomeAvaliador.get(a.atualizado_por ?? a.criado_por ?? "") ?? "—"}
                                    </td>
                                    {NOTAS.slice(0, QUESTIONARIOS[g.q].perguntas.length).map((n) => (
                                      <td key={n} className="border border-slate-200 px-2 py-1 text-center tabular-nums">
                                        {a[n]}
                                      </td>
                                    ))}
                                    <td
                                      className={`border border-slate-200 bg-slate-50 px-2 py-1 text-center text-sm font-semibold tabular-nums ${corDaNota(Number(a.media))}`}
                                    >
                                      {nota(a.media)}
                                    </td>
                                    {(admin || selecionada) && (
                                      <td className="space-x-3 whitespace-nowrap border border-slate-200 px-2 py-1 text-center font-normal">
                                        {alteravel && (
                                          <Link
                                            href={`/avaliacao/adb/nova?academia=${a.academia_id}&funcionario=${a.funcionario_id}`}
                                            className="font-medium text-marca underline hover:text-marca-escuro"
                                          >
                                            Alterar
                                          </Link>
                                        )}
                                        {admin && <ExcluirAvaliacao excluir={excluirAvaliacao.bind(null, a.id)} />}
                                      </td>
                                    )}
                                  </tr>
                                  {comentarios.length > 0 && (
                                    <tr>
                                      <td
                                        colSpan={QUESTIONARIOS[g.q].perguntas.length + 3 + (admin || selecionada ? 1 : 0)}
                                        className="border border-slate-200 bg-white px-2 py-1 font-normal text-slate-700"
                                      >
                                        {comentarios.map((x) => (
                                          <p key={x.campo} className="whitespace-pre-wrap">
                                            <span className="font-semibold">{x.titulo}:</span> {a[x.campo]}
                                          </p>
                                        ))}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
