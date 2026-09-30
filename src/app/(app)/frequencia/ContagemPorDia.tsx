"use client";

import { useState, useTransition } from "react";
import type { AulaDoDia, DiaDeAulas } from "@/lib/contagemPorDia";

const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
const dataBr = (d: string) => d.split("-").reverse().join("/");

export type ItemDoDia = {
  id: string | null;
  horario: string;
  modalidade: string;
  professor: string | null;
  substituto: string;
  quantidade: string;
};
type Salvar = (
  data: string,
  itens: ItemDoDia[],
) => Promise<{ erro?: string; ok?: string }>;

// Um dia: a grade do dia com as quantidades. Aula lançada pode ser corrigida; aula da grade sem contagem pode
// ser lançada digitando a quantidade (e o substituto, se outro professor deu a aula).
function Dia({
  dia,
  salvar,
  somenteLeitura,
}: {
  dia: DiaDeAulas;
  salvar: Salvar;
  somenteLeitura: boolean;
}) {
  const inicial = (a: AulaDoDia) => ({
    quantidade: a.quantidade === null ? "" : String(a.quantidade),
    substituto: a.substituto ?? "",
  });
  const [valores, setValores] = useState(dia.aulas.map(inicial));
  // Depois de salvar, a tela recarrega os dados do dia: os campos voltam a mostrar o que está gravado.
  const [base, setBase] = useState(dia);
  if (base !== dia) {
    setBase(dia);
    setValores(dia.aulas.map(inicial));
  }
  const [resultado, setResultado] = useState<{
    erro?: string;
    ok?: string;
  } | null>(null);
  const [salvando, iniciar] = useTransition();
  const faltando = dia.aulas.filter((a) => a.naGrade && a.id === null).length;
  const alterados = dia.aulas
    .map((a, i) => ({ a, v: valores[i], o: inicial(a) }))
    .filter(
      ({ v, o }) =>
        v.quantidade !== o.quantidade || v.substituto !== o.substituto,
    );

  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50">
        <span className="flex items-center gap-2">
          <span className="text-slate-400 transition group-open:rotate-90">
            ›
          </span>
          <span className="font-medium text-slate-900">{dataBr(dia.data)}</span>
          <span className="capitalize text-slate-500">
            {DIAS[new Date(`${dia.data}T12:00:00Z`).getUTCDay()]}
          </span>
          {dia.feriado && (
            <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">
              feriado
            </span>
          )}
        </span>
        <span className="flex items-center gap-4 tabular-nums text-slate-600">
          <span>
            <strong className="text-slate-900">{dia.lancadas}</strong> de{" "}
            {dia.previstas} aulas
          </span>
          <span>
            <strong className="text-slate-900">
              {dia.alunos.toLocaleString("pt-BR")}
            </strong>{" "}
            alunos
          </span>
          {faltando > 0 && (
            <span className="rounded bg-red-100 px-1.5 text-xs font-medium text-red-800">
              {faltando} sem contagem
            </span>
          )}
        </span>
      </summary>
      <div className="border-t border-slate-100 p-3">
        <div className="overflow-auto rounded-md border border-slate-300">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  Horário
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  Modalidade
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  Professor
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  Alunos
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left normal-case">
                  Substituto (se outro deu a aula)
                </th>
              </tr>
            </thead>
            <tbody>
              {dia.aulas.map((a, i) => (
                <tr
                  key={`${a.id ?? "g"}${a.horario}${a.modalidade}`}
                  className={a.id === null ? "bg-red-50/40" : ""}
                >
                  <td className="border border-slate-300 bg-slate-50 px-2 py-1.5 tabular-nums">
                    {a.horario}
                  </td>
                  <td className="border border-slate-300 bg-slate-50 px-2 py-1.5">
                    {a.modalidade}
                    {!a.naGrade && (
                      <span className="ml-1 text-xs text-slate-500">
                        (fora da grade)
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-300 bg-slate-50 px-2 py-1.5">
                    {a.professor ?? (
                      <span className="text-amber-700">sem professor</span>
                    )}
                  </td>
                  <td className="border border-slate-300 px-1 py-1">
                    {somenteLeitura ? (
                      <span className="px-1 tabular-nums">
                        {a.quantidade ?? "—"}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={valores[i].quantidade}
                        onChange={(e) =>
                          setValores((v) =>
                            v.map((x, j) =>
                              j === i
                                ? { ...x, quantidade: e.target.value }
                                : x,
                            ),
                          )
                        }
                        aria-label={`Alunos na aula das ${a.horario}`}
                        className="w-24 rounded border border-slate-300 px-2 py-1 tabular-nums"
                      />
                    )}
                  </td>
                  <td className="border border-slate-300 px-1 py-1">
                    {somenteLeitura ? (
                      <span className="px-1">{a.substituto ?? ""}</span>
                    ) : (
                      <input
                        value={valores[i].substituto}
                        onChange={(e) =>
                          setValores((v) =>
                            v.map((x, j) =>
                              j === i
                                ? { ...x, substituto: e.target.value }
                                : x,
                            ),
                          )
                        }
                        aria-label={`Substituto na aula das ${a.horario}`}
                        className="w-48 rounded border border-slate-300 px-2 py-1"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!somenteLeitura && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={salvando || alterados.length === 0}
              onClick={() => {
                setResultado(null);
                iniciar(async () =>
                  setResultado(
                    await salvar(
                      dia.data,
                      alterados.map(({ a, v }) => ({
                        id: a.id,
                        horario: a.horario,
                        modalidade: a.modalidade,
                        professor: a.professor,
                        ...v,
                      })),
                    ),
                  ),
                );
              }}
              className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
            >
              {salvando
                ? "Salvando…"
                : alterados.length
                  ? `Salvar ${alterados.length} alteração(ões)`
                  : "Salvar"}
            </button>
            <span className="text-xs text-slate-500">
              Aula em vermelho = ainda sem contagem. Se não aconteceu, digite 0.
            </span>
          </div>
        )}
        {resultado?.erro && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {resultado.erro}
          </p>
        )}
        {resultado?.ok && (
          <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {resultado.ok}
          </p>
        )}
      </div>
    </details>
  );
}

// Contagem agrupada por dia (do mais recente para o mais antigo).
export function ContagemPorDia({
  dias,
  salvar,
  somenteLeitura,
}: {
  dias: DiaDeAulas[];
  salvar: Salvar;
  somenteLeitura: boolean;
}) {
  if (!dias.length)
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Nenhuma aula neste mês.
      </p>
    );
  return (
    <div className="space-y-2">
      {dias.map((d) => (
        <Dia
          key={d.data}
          dia={d}
          salvar={salvar}
          somenteLeitura={somenteLeitura}
        />
      ))}
    </div>
  );
}
