"use client";

import { useState, useTransition } from "react";
import { fecharPeriodo } from "./actions";

export function FormFechamento({ atual }: { atual: string | null }) {
  const [data, setData] = useState("");
  const [observacao, setObservacao] = useState("");
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const reabre = atual && data && data < atual;
  const gravar = () => {
    const texto = reabre
      ? `Reabrir o financeiro de ${data.split("-").reverse().join("/")} em diante? Os lançamentos depois dessa data voltam a poder ser alterados.`
      : `Fechar o financeiro até ${data.split("-").reverse().join("/")}? Contas a pagar e a receber, baixas e o extrato até essa data ficam travados.`;
    if (!window.confirm(texto)) return;
    iniciar(async () => {
      const r = await fecharPeriodo({ data, observacao });
      setM(r);
      if (r.ok) {
        setData("");
        setObservacao("");
      }
    });
  };
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Fechar até (inclusive)</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="min-w-72 flex-1 text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Observação (opcional)</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="ex.: fechamento de outubro conferido" className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <button type="button" onClick={gravar} disabled={ocupado || !data} className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
          {ocupado ? "Gravando…" : reabre ? "Reabrir período" : "Fechar período"}
        </button>
      </div>
      {reabre && <p className="text-xs text-amber-800">A data é anterior ao fechamento atual: isso reabre o período entre as duas datas.</p>}
      {m?.erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{m.erro}</p>}
      {m?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{m.ok}</p>}
    </div>
  );
}
