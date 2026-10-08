"use client";

import { Fragment, useState } from "react";

// Tabela das demonstrações (DRE, balanço, DFC): uma coluna por período, linhas de grupo que abrem as contas
// da contabilidade ao clicar, e totais em destaque. Na DRE, cada coluna mostra também o % sobre a receita bruta.

export type ColunaDemo = { rotulo: string; detalhe?: string };
export type LinhaDemo = {
  rotulo: string;
  tipo: "secao" | "grupo" | "total" | "resultado";
  valores: (number | null)[];
  filhos?: { rotulo: string; valores: (number | null)[] }[];
};

const reais = (v: number | null) =>
  v === null ? "" : Math.abs(v) < 0.005 ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null, base: number | null) =>
  v === null || !base || Math.abs(v) < 0.005 ? "" : `${((v / base) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function TabelaDemonstrativo({ colunas, linhas, base }: { colunas: ColunaDemo[]; linhas: LinhaDemo[]; base?: (number | null)[] }) {
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const alternar = (i: number) => {
    const novo = new Set(abertas);
    if (novo.has(i)) novo.delete(i);
    else novo.add(i);
    setAbertas(novo);
  };
  const comPct = Boolean(base);

  return (
    <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-slate-50 text-xs text-slate-600">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold">Descrição</th>
            {colunas.map((c) => (
              <th key={c.rotulo} colSpan={comPct ? 2 : 1} className="px-3 py-2 text-right font-semibold">
                <span className="block">{c.rotulo}</span>
                {c.detalhe && <span className="block font-normal text-slate-500">{c.detalhe}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            if (l.tipo === "secao")
              return (
                <tr key={i} className="border-t border-slate-200 bg-slate-50/60">
                  <td colSpan={1 + colunas.length * (comPct ? 2 : 1)} className="sticky left-0 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-marca">
                    {l.rotulo}
                  </td>
                </tr>
              );
            const temFilhos = (l.filhos?.length ?? 0) > 0;
            const aberta = abertas.has(i);
            const forte = l.tipo === "total" || l.tipo === "resultado";
            return (
              <Fragment key={i}>
                <tr
                  className={`border-t border-slate-100 ${l.tipo === "resultado" ? "bg-marca/5 font-semibold text-slate-900" : forte ? "bg-slate-50 font-semibold text-slate-900" : "text-slate-700"} ${temFilhos ? "cursor-pointer hover:bg-slate-50" : ""}`}
                  onClick={temFilhos ? () => alternar(i) : undefined}
                >
                  <td className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 ${l.tipo === "resultado" ? "bg-[#f3f6fb]" : forte ? "bg-slate-50" : "bg-white"} ${l.tipo === "grupo" ? "pl-6" : ""}`}>
                    {temFilhos && <span className={`mr-1 inline-block text-slate-400 transition ${aberta ? "rotate-90" : ""}`}>›</span>}
                    {l.rotulo}
                  </td>
                  {l.valores.map((v, j) => (
                    <Fragment key={j}>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${v !== null && v < -0.004 ? "text-red-700" : ""}`}>{reais(v)}</td>
                      {comPct && <td className="whitespace-nowrap py-1.5 pr-3 text-right text-xs tabular-nums text-slate-500">{pct(v, base?.[j] ?? null)}</td>}
                    </Fragment>
                  ))}
                </tr>
                {aberta &&
                  l.filhos!.map((f, k) => (
                    <tr key={`${i}-${k}`} className="border-t border-slate-50 text-xs text-slate-500">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1 pl-10 pr-3">{f.rotulo}</td>
                      {f.valores.map((v, j) => (
                        <Fragment key={j}>
                          <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums">{reais(v)}</td>
                          {comPct && <td className="whitespace-nowrap py-1 pr-3 text-right tabular-nums">{pct(v, base?.[j] ?? null)}</td>}
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
  );
}
