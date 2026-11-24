"use client";

import { useState, useTransition } from "react";
import { salvarAreaAcademia } from "./actions";

type AcademiaArea = { id: string; nome: string; area: number | null };

const br = (n: number | null) => (n === null ? "" : n.toLocaleString("pt-BR"));

// Botão ✏️ do cartão "Índice de ocupação": abre os campos de área (m²) das academias que o usuário pode alterar.
export function EditarArea({ academias }: { academias: AcademiaArea[] }) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState(() => Object.fromEntries(academias.map((a) => [a.id, br(a.area)])));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  if (!academias.length) return null;
  const salvar = () => {
    setErro(null);
    iniciar(async () => {
      for (const a of academias) {
        if (valores[a.id] === br(a.area)) continue;
        const r = await salvarAreaAcademia(a.id, valores[a.id]);
        if (r.erro) return setErro(academias.length > 1 ? `${a.nome}: ${r.erro}` : r.erro);
      }
      setAberto(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        title="Editar a área (m²) da academia"
        className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        ✏️<span className="hidden sm:inline"> Editar</span>
      </button>
      {aberto && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {academias.map((a) => (
            <label key={a.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>{academias.length > 1 ? a.nome : "Área da academia"}</span>
              <span className="flex items-center gap-1">
                <input
                  value={valores[a.id]}
                  onChange={(e) => setValores({ ...valores, [a.id]: e.target.value })}
                  inputMode="decimal"
                  placeholder="ex.: 850"
                  className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                />
                m²
              </span>
            </label>
          ))}
          {erro && <p className="text-xs text-red-700">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={salvar} disabled={salvando} className="rounded-md bg-marca px-3 py-1 text-xs font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
