"use client";

import { Fragment, useState } from "react";
import type { VisitantesPorOrigem } from "@/lib/painelDados";
import { alunosDeOutrasUnidades } from "./painelActions";

// Alunos de outras unidades por unidade de origem: passagens, alunos, dias de acesso e a média de dias por aluno.
// Clicar numa origem abre a lista aluno por aluno.

type Aluno = Awaited<ReturnType<typeof alunosDeOutrasUnidades>>[number];
const n = (v: number, casas = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const media = (dias: number, alunos: number) => (alunos ? n(dias / alunos, 1) : "—");

export function OrigensVisitantes({
  titulo,
  linhas,
  unidade,
  inicio,
  fim,
  mostrarAcademia,
}: {
  titulo: string;
  linhas: VisitantesPorOrigem[];
  unidade: string | null;
  inicio: string;
  fim: string;
  mostrarAcademia: boolean;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [alunos, setAlunos] = useState<Record<string, Aluno[] | "carregando">>({});
  const abrir = async (origem: string) => {
    if (aberta === origem) return setAberta(null);
    setAberta(origem);
    if (!alunos[origem]) {
      setAlunos((x) => ({ ...x, [origem]: "carregando" }));
      const lista = await alunosDeOutrasUnidades(unidade, inicio, fim, origem);
      setAlunos((x) => ({ ...x, [origem]: lista }));
    }
  };
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold text-slate-700">{titulo}</p>
      {linhas.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma passagem de outras unidades.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full min-w-96 text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium">Unidade de origem</th>
                <th className="py-1 text-right font-medium">Passagens</th>
                <th className="py-1 text-right font-medium">Alunos</th>
                <th className="py-1 text-right font-medium">Dias de acesso</th>
                <th className="py-1 text-right font-medium" title="Dias de acesso ÷ alunos">
                  Média dias/aluno
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l) => {
                const lista = alunos[l.unidade_origem];
                return (
                  <Fragment key={l.unidade_origem}>
                    <tr onClick={() => abrir(l.unidade_origem)} className="cursor-pointer hover:bg-sky-50" title="Clique para ver aluno por aluno">
                      <td className="py-1">
                        <span className="mr-1 text-slate-400">{aberta === l.unidade_origem ? "▾" : "▸"}</span>
                        {l.unidade_origem}
                      </td>
                      <td className="py-1 text-right tabular-nums">{n(l.passagens)}</td>
                      <td className="py-1 text-right tabular-nums">{n(l.alunos)}</td>
                      <td className="py-1 text-right tabular-nums">{n(l.dias)}</td>
                      <td className="py-1 text-right font-medium tabular-nums">{media(l.dias, l.alunos)}</td>
                    </tr>
                    {aberta === l.unidade_origem && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-2 py-2">
                          {lista === "carregando" || !lista ? (
                            <p className="text-slate-500">Carregando…</p>
                          ) : (
                            <table className="w-full">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="py-0.5 text-left font-medium">Aluno</th>
                                  {mostrarAcademia && <th className="py-0.5 text-left font-medium">Veio à</th>}
                                  <th className="py-0.5 text-right font-medium">Dias</th>
                                  <th className="py-0.5 text-right font-medium">Passagens</th>
                                  <th className="py-0.5 text-right font-medium">Último dia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lista.map((a) => (
                                  <tr key={`${a.cliente_id}-${a.academia}`} className="border-t border-slate-200/60">
                                    <td className="py-0.5">
                                      {a.nome ?? a.cliente_id}
                                      {a.nome && <span className="ml-1 text-slate-400">#{a.cliente_id}</span>}
                                    </td>
                                    {mostrarAcademia && <td className="py-0.5">{a.academia}</td>}
                                    <td className="py-0.5 text-right tabular-nums">{a.dias}</td>
                                    <td className="py-0.5 text-right tabular-nums">{a.passagens}</td>
                                    <td className="py-0.5 text-right tabular-nums">{a.ultimo.split("-").reverse().join("/")}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
