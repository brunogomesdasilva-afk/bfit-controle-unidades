"use client";

import { useState, useTransition } from "react";

// Dias do controle diário ainda sem lançamento (do último lançado até hoje): uma linha por dia, para preencher
// e gravar todos de uma vez (ex.: na segunda, sábado, domingo e segunda).

type Campo = { campo: string; rotulo: string; tipo: string };
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const rotuloDia = (d: string) => `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function DiasPendentes({
  dias,
  campos,
  salvar,
}: {
  dias: string[];
  campos: Campo[];
  salvar: (linhas: Record<string, string>[]) => Promise<{ erro?: string; ok?: string }>;
}) {
  const [valores, setValores] = useState<Record<string, Record<string, string>>>({});
  const [mensagem, setMensagem] = useState<{ erro?: string; ok?: string } | null>(null);
  const [gravando, iniciar] = useTransition();
  if (!dias.length) return mensagem?.ok ? <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensagem.ok}</p> : null;

  const alterar = (dia: string, campo: string, valor: string) => setValores({ ...valores, [dia]: { ...valores[dia], [campo]: valor } });
  const gravar = () =>
    iniciar(async () => {
      const r = await salvar(dias.map((d) => ({ ...valores[d], data: d })));
      setMensagem(r);
      if (r.ok) setValores({});
    });

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
      <p className="mb-2 text-sm font-medium text-amber-900">
        {dias.length === 1 ? "Dia sem lançamento" : `${dias.length} dias sem lançamento`}: preencha e grave todos de uma vez.
      </p>
      <div className="overflow-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-xs text-slate-600">
              <th className="px-2 py-1 text-left font-medium">Dia</th>
              {campos.map((c) => (
                <th key={c.campo} className="px-1 py-1 text-left font-medium">
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d}>
                <td className="whitespace-nowrap px-2 py-1 font-medium capitalize text-slate-800">{rotuloDia(d)}</td>
                {campos.map((c) => (
                  <td key={c.campo} className="px-1 py-1">
                    <input
                      value={valores[d]?.[c.campo] ?? ""}
                      onChange={(e) => alterar(d, c.campo, e.target.value)}
                      inputMode={c.tipo === "inteiro" ? "numeric" : "decimal"}
                      disabled={gravando}
                      aria-label={`${c.rotulo} em ${rotuloDia(d)}`}
                      className={`${c.tipo === "moeda" ? "w-28" : "w-20"} rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={gravar} disabled={gravando} className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
          {gravando ? "Gravando…" : dias.length === 1 ? "Gravar o dia" : `Gravar os ${dias.length} dias`}
        </button>
        <span className="text-xs text-slate-500">Dia deixado em branco não é gravado. NPS aceita negativo.</span>
      </div>
      {mensagem?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{mensagem.erro}</p>}
    </div>
  );
}
