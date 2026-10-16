"use client";

import { useState, useSyncExternalStore } from "react";

const nadaParaOuvir = () => () => {};

export type Lembrete = { chave: string; nome: string; academia: string; departamento: string; quando: string; idade: number };

// Aviso dos aniversários do dia (e dos que caem no fim de semana/feriado seguinte), no meio da tela.
// Depois de fechado, só volta no dia seguinte (fica guardado neste navegador).
export function LembreteAniversario({ dia, lembretes }: { dia: string; lembretes: Lembrete[] }) {
  const chave = `aniversarios_vistos_${dia}`;
  // No servidor fica fechado; no navegador, aberto até ser visto hoje (guardado no localStorage).
  const visto = useSyncExternalStore(
    nadaParaOuvir,
    () => {
      try {
        return localStorage.getItem(chave) === "1";
      } catch {
        return false;
      }
    },
    () => true
  );
  const [fechadoEm, setFechadoEm] = useState<string | null>(null);

  if (visto || fechadoEm === chave || lembretes.length === 0) return null;
  const fechar = () => {
    try {
      localStorage.setItem(chave, "1");
    } catch {}
    setFechadoEm(chave);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:hidden" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lembrete-titulo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-auto rounded-xl bg-white p-6 text-center shadow-xl"
      >
        <p className="text-4xl" aria-hidden>
          🎂
        </p>
        <h2 id="lembrete-titulo" className="mt-2 text-lg font-semibold text-marca">
          Lembrete de aniversário
        </h2>
        <ul className="mt-4 space-y-3 text-sm text-slate-800">
          {lembretes.map((l) => (
            <li key={l.chave} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-base font-semibold text-slate-900">{l.nome}</p>
              <p>
                {l.departamento} · {l.academia}
              </p>
              <p>
                Faz {l.idade} anos <span className="font-medium">{l.quando}</span>
              </p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={fechar}
          autoFocus
          className="mt-5 rounded-md bg-marca px-5 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          OK, fechar
        </button>
      </div>
    </div>
  );
}
