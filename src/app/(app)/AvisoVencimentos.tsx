"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

export type Vencimento = { id: string; academiaId: string; academia: string; item: string; vencimento: string; dias: number; link: string };

const data = (d: string) => d.split("-").reverse().join("/");

// Aviso de prazos no meio da tela: datas importantes (30 dias), CREF dos professores (7 dias) e limite das
// férias (60 dias), inclusive os vencidos. Aparece todo dia (e a cada login) enquanto a data não for alterada;
// fechado, só volta no dia seguinte ou no próximo login.
export function AvisoVencimentos({ sessao, vencimentos }: { sessao: string; vencimentos: Vencimento[] }) {
  const chave = `vencimentos_vistos_${sessao}`;
  // Já fechado neste login? (lido do navegador; no servidor conta como fechado, para não piscar)
  const visto = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(chave) === "1";
      } catch {
        return false;
      }
    },
    () => true
  );
  const [fechadoAgora, setFechadoAgora] = useState(false);
  const aberto = !visto && !fechadoAgora && vencimentos.length > 0;

  const fechar = () => {
    try {
      localStorage.setItem(chave, "1");
    } catch {}
    setFechadoAgora(true);
  };
  if (!aberto) return null;
  const variasUnidades = new Set(vencimentos.map((v) => v.academiaId)).size > 1;

  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center bg-slate-900/40 p-4 print:hidden" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-vencimentos-titulo"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="aviso-vencimentos-titulo" className="text-lg font-semibold text-red-700">
            Prazos e vencimentos
          </h2>
          <p className="text-sm text-slate-600">
            Datas importantes (próximos 30 dias), CREF dos professores (7 dias) e férias (60 dias). Depois de resolver,
            atualize a data no cadastro.
          </p>
        </div>
        <ul className="space-y-2 overflow-auto px-5 py-4 text-sm">
          {vencimentos.map((v) => (
            <li
              key={v.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${v.dias < 0 ? "bg-red-50" : "bg-amber-50"}`}
            >
              <span>
                <Link href={v.link} onClick={fechar} className="font-semibold text-slate-900 underline">
                  {v.item}
                </Link>
                {variasUnidades && <span className="text-slate-500"> · {v.academia}</span>}
                <span className="block text-xs text-slate-600">Vencimento {data(v.vencimento)}</span>
              </span>
              <span className={`shrink-0 font-semibold ${v.dias < 0 ? "text-red-700" : "text-amber-800"}`}>
                {v.dias < 0 ? `vencido há ${-v.dias} ${v.dias === -1 ? "dia" : "dias"}` : v.dias === 0 ? "vence hoje" : `faltam ${v.dias} ${v.dias === 1 ? "dia" : "dias"}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-200 px-5 py-3 text-right">
          <button type="button" onClick={fechar} className="rounded-md bg-marca px-5 py-2 text-sm font-medium text-white hover:opacity-90">
            OK, fechar
          </button>
        </div>
      </div>
    </div>
  );
}
