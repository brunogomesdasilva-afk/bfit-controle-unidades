"use client";

import { Fragment, useState } from "react";

// Quadro das demonstrações no estilo do relatório gerencial: título azul centralizado, linhas finas alternadas,
// subitens recuados. Uma coluna por período (com o % da receita na DRE). Clicar numa linha com contas mostra as
// contas da contabilidade que a formam.

export type ColunaDemo = { rotulo: string; detalhe?: string };
export type LinhaDemo = {
  rotulo: string;
  nivel?: 0 | 1;
  forte?: boolean; // resultados (receita líquida, EBITDA, lucro, totais)
  valores: (number | null)[];
  filhos?: { rotulo: string; valores: (number | null)[] }[];
};

const reais = (v: number | null) =>
  v === null ? "" : Math.abs(v) < 0.005 ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null, base: number | null) =>
  v === null || !base || Math.abs(v) < 0.005 ? "" : `${((v / base) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function TabelaDemonstrativo({
  titulo,
  colunas,
  linhas,
  base,
}: {
  titulo: string;
  colunas: ColunaDemo[];
  linhas: LinhaDemo[];
  base?: (number | null)[];
}) {
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const alternar = (i: number) => {
    const novo = new Set(abertas);
    if (novo.has(i)) novo.delete(i);
    else novo.add(i);
    setAbertas(novo);
  };
  const comPct = Boolean(base);

  return (
    <div className="w-fit min-w-0 max-w-full">
      {titulo && <h3 className="mb-2 text-center text-base font-semibold text-sky-600">{titulo}</h3>}
      <div className="overflow-auto">
        <table className="min-w-max text-[12.5px] text-slate-800">
          <thead>
            <tr className="text-slate-700">
              <th className="px-2 pb-0.5 text-left font-normal" />
              {colunas.map((c) => (
                <th key={c.rotulo} colSpan={comPct ? 2 : 1} className="px-2 pb-0.5 text-right font-normal">
                  {c.rotulo}
                  {c.detalhe && <span className="ml-1 text-[11px] text-slate-500">{c.detalhe}</span>}
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-800 text-slate-700">
              <th className="px-2 pb-1 text-left font-normal">Descrição</th>
              {colunas.map((c) => (
                <Fragment key={c.rotulo}>
                  <th className="px-2 pb-1 text-right font-normal">Valor</th>
                  {comPct && <th className="px-2 pb-1 text-right font-normal">%</th>}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const temFilhos = (l.filhos?.length ?? 0) > 0;
              const aberta = abertas.has(i);
              return (
                <Fragment key={i}>
                  <tr
                    className={`${i % 2 ? "bg-slate-100" : "bg-white"} ${l.forte ? "font-semibold" : ""} ${temFilhos ? "cursor-pointer hover:bg-sky-50" : ""}`}
                    onClick={temFilhos ? () => alternar(i) : undefined}
                    title={temFilhos ? "Clique para ver as contas" : undefined}
                  >
                    <td className={`min-w-[10rem] py-[3px] pr-4 ${l.nivel === 1 ? "pl-7" : "pl-2"}`}>{l.rotulo}</td>
                    {l.valores.map((v, j) => (
                      <Fragment key={j}>
                        <td className="whitespace-nowrap border-l border-slate-300 px-2 py-[3px] text-right tabular-nums">{reais(v)}</td>
                        {comPct && <td className="whitespace-nowrap px-2 py-[3px] text-right tabular-nums text-slate-600">{pct(v, base?.[j] ?? null)}</td>}
                      </Fragment>
                    ))}
                  </tr>
                  {aberta &&
                    l.filhos!.map((f, k) => (
                      <tr key={`${i}-${k}`} className="bg-sky-50/60 text-[11.5px] text-slate-600">
                        <td className={`whitespace-nowrap py-[2px] pr-4 ${l.nivel === 1 ? "pl-12" : "pl-7"}`}>{f.rotulo}</td>
                        {f.valores.map((v, j) => (
                          <Fragment key={j}>
                            <td className="whitespace-nowrap border-l border-slate-200 px-2 py-[2px] text-right tabular-nums">{reais(v)}</td>
                            {comPct && <td className="whitespace-nowrap px-2 py-[2px] text-right tabular-nums">{pct(v, base?.[j] ?? null)}</td>}
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
