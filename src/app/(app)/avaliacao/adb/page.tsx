import Link from "next/link";
import {
  NOTAS,
  PERGUNTAS_ABERTAS,
  periodoDoHorario,
  QUESTIONARIOS,
  type Avaliacao,
  type Questionario,
} from "@/lib/adb";
import { contextoAcademias } from "@/lib/contexto";
import { DEPARTAMENTOS, type Funcionario } from "@/lib/database.types";
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

const CELULA = "border border-slate-300 px-2 py-1.5 align-top";

// A.D.B: mostra as avaliações de um mês (por padrão, o último mês avaliado) no formato da planilha:
// funcionários nas colunas, perguntas nas linhas e a linha NOTA com a média de cada um.
export default async function AdbPage({ searchParams }: { searchParams: Promise<{ academia?: string; mes?: string }> }) {
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(params.academia);
  const mesAtual = hoje().slice(0, 7);

  // Mês exibido: o da URL ou o último que tem avaliação (histórico da última atualização).
  let mes = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : null;
  if (!mes) {
    let ultima = supabase.from("avaliacoes_adb").select("mes").order("mes", { ascending: false }).limit(1);
    if (selecionada) ultima = ultima.eq("academia_id", selecionada);
    const { data } = await ultima;
    mes = data?.[0]?.mes ? String(data[0].mes).slice(0, 7) : mesAtual;
  }

  let consulta = supabase.from("avaliacoes_adb").select("*").eq("mes", `${mes}-01`);
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  const avaliacoes = ((await consulta).data ?? []) as Avaliacao[];

  const idsFuncionarios = [...new Set(avaliacoes.map((a) => a.funcionario_id))];
  const idsAvaliadores = [...new Set(avaliacoes.flatMap((a) => [a.criado_por, a.atualizado_por]).filter(Boolean))] as string[];
  const [{ data: funcionarios }, { data: perfis }] = await Promise.all([
    idsFuncionarios.length ? supabase.from("funcionarios").select("*").in("id", idsFuncionarios) : Promise.resolve({ data: [] }),
    idsAvaliadores.length ? supabase.from("profiles").select("id, nome").in("id", idsAvaliadores) : Promise.resolve({ data: [] }),
  ]);
  const funcionarioPorId = new Map(((funcionarios ?? []) as Funcionario[]).map((f) => [f.id, f]));
  const nomeAvaliador = new Map((perfis ?? []).map((p) => [p.id as string, p.nome as string]));
  const nomeAcademia = new Map(academias.map((a) => [a.id, a.nome]));

  const [ano, m] = mes.split("-").map(Number);
  const mesAnterior = `${m === 1 ? ano - 1 : ano}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const mesSeguinte = `${m === 12 ? ano + 1 : ano}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const linkMes = (x: string) => `/avaliacao/adb?${new URLSearchParams({ ...(selecionada ? { academia: selecionada } : {}), mes: x })}`;
  const podeAlterar = mes === mesAtual;

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
            <span className="text-slate-500">Mês:</span>
            <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white">
              <Link href={linkMes(mesAnterior)} aria-label="Mês anterior" className="px-2.5 py-1 text-slate-600 hover:bg-slate-50">
                ‹
              </Link>
              <span className="min-w-36 border-x border-slate-300 px-3 py-1 text-center font-medium capitalize text-slate-900">
                {nomeDoMes(mes)}
              </span>
              <Link href={linkMes(mesSeguinte)} aria-label="Próximo mês" className="px-2.5 py-1 text-slate-600 hover:bg-slate-50">
                ›
              </Link>
            </div>
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

          {avaliacoes.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Nenhuma avaliação em {nomeDoMes(mes)}.
            </p>
          )}

          {(["professores", "recepcao"] as Questionario[]).map((q) => {
            const doQuestionario = avaliacoes
              .filter((a) => a.questionario === q)
              .sort((a, b) =>
                `${nomeAcademia.get(a.academia_id)} ${funcionarioPorId.get(a.funcionario_id)?.nome}`.localeCompare(
                  `${nomeAcademia.get(b.academia_id)} ${funcionarioPorId.get(b.funcionario_id)?.nome}`,
                  "pt-BR"
                )
              );
            if (doQuestionario.length === 0) return null;
            const { nome, perguntas } = QUESTIONARIOS[q];
            const mediaGeral = media(doQuestionario.map((a) => Number(a.media)));

            return (
              <section key={q} className="mb-8">
                <h2 className="mb-2 text-sm font-semibold text-slate-900">Avaliação {nome}</h2>
                <div className="overflow-auto rounded-md border border-slate-300 bg-white">
                  <table className="border-collapse text-sm">
                    <tbody>
                      <tr className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                        <th className={`${CELULA} sticky left-0 z-10 min-w-80 bg-slate-100 text-left`}>Avaliado</th>
                        {doQuestionario.map((a) => (
                          <th key={a.id} className={`${CELULA} min-w-32 text-center normal-case`}>
                            <span className="block text-sm text-slate-900">
                              {funcionarioPorId.get(a.funcionario_id)?.nome ?? "—"}
                            </span>
                            {!selecionada && (
                              <span className="block font-normal text-slate-500">{nomeAcademia.get(a.academia_id)}</span>
                            )}
                          </th>
                        ))}
                        <th className={`${CELULA} min-w-24 bg-slate-200 text-center`}>Média</th>
                      </tr>
                      {[
                        ["Cargo", (a: Avaliacao) => DEPARTAMENTOS[funcionarioPorId.get(a.funcionario_id)?.departamento ?? "professores"]],
                        ["Período", (a: Avaliacao) => periodoDoHorario(funcionarioPorId.get(a.funcionario_id)?.horario_entrada ?? null)],
                        [
                          "Avaliador",
                          (a: Avaliacao) => nomeAvaliador.get(a.atualizado_por ?? a.criado_por ?? "") ?? "—",
                        ],
                      ].map(([rotulo, valor]) => (
                        <tr key={rotulo as string} className="text-slate-600">
                          <th className={`${CELULA} sticky left-0 bg-white text-left font-medium`}>{rotulo as string}</th>
                          {doQuestionario.map((a) => (
                            <td key={a.id} className={`${CELULA} text-center`}>
                              {(valor as (a: Avaliacao) => string)(a)}
                            </td>
                          ))}
                          <td className={`${CELULA} bg-slate-50`} />
                        </tr>
                      ))}
                      <tr className="bg-slate-200 font-semibold">
                        <th className={`${CELULA} sticky left-0 bg-slate-200 text-left`}>NOTA (Avaliação Desempenho)</th>
                        {doQuestionario.map((a) => (
                          <td key={a.id} className={`${CELULA} text-center text-base tabular-nums ${corDaNota(Number(a.media))}`}>
                            {nota(a.media)}
                          </td>
                        ))}
                        <td className={`${CELULA} text-center text-base tabular-nums ${corDaNota(mediaGeral)}`}>{nota(mediaGeral)}</td>
                      </tr>
                      {perguntas.map((p, i) => {
                        const valores = doQuestionario.map((a) => a[NOTAS[i]]);
                        return (
                          <tr key={p.titulo}>
                            <th className={`${CELULA} sticky left-0 bg-white text-left font-normal`} title={p.descricao}>
                              <span className="font-medium text-slate-900">
                                {i + 1}. {p.titulo}
                              </span>
                            </th>
                            {doQuestionario.map((a) => (
                              <td key={a.id} className={`${CELULA} text-center tabular-nums`}>
                                {a[NOTAS[i]]}
                              </td>
                            ))}
                            <td className={`${CELULA} bg-slate-50 text-center tabular-nums text-slate-600`}>
                              {nota(media(valores))}
                            </td>
                          </tr>
                        );
                      })}
                      {PERGUNTAS_ABERTAS.map((p) => (
                        <tr key={p.campo}>
                          <th className={`${CELULA} sticky left-0 bg-white text-left font-normal`} title={p.descricao}>
                            <span className="font-medium text-slate-900">{p.titulo}</span>
                          </th>
                          {doQuestionario.map((a) => (
                            <td key={a.id} className={`${CELULA} max-w-56 whitespace-pre-wrap text-xs text-slate-700`}>
                              {a[p.campo] ?? ""}
                            </td>
                          ))}
                          <td className={`${CELULA} bg-slate-50`} />
                        </tr>
                      ))}
                      {(podeAlterar || admin) && selecionada && (
                        <tr>
                          <th className={`${CELULA} sticky left-0 bg-white`} />
                          {doQuestionario.map((a) => (
                            <td key={a.id} className={`${CELULA} space-x-3 text-center`}>
                              {podeAlterar && (
                                <Link
                                  href={`/avaliacao/adb/nova?academia=${selecionada}&funcionario=${a.funcionario_id}`}
                                  className="text-xs font-medium text-marca underline hover:text-marca-escuro"
                                >
                                  Alterar
                                </Link>
                              )}
                              {admin && <ExcluirAvaliacao excluir={excluirAvaliacao.bind(null, a.id)} />}
                            </td>
                          ))}
                          <td className={`${CELULA} bg-slate-50`} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Passe o mouse sobre uma pergunta para ver a descrição completa.
                </p>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
