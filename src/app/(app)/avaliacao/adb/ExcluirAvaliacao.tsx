"use client";

import { useState, useTransition } from "react";
import type { ResultadoAdb } from "./actions";

export function ExcluirAvaliacao({ excluir }: { excluir: () => Promise<ResultadoAdb> }) {
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => {
          if (!window.confirm("Excluir esta avaliação? Essa ação não pode ser desfeita.")) return;
          iniciar(async () => setErro((await excluir()).erro ?? null));
        }}
        className="text-xs text-red-700 underline hover:text-red-900 disabled:text-slate-400"
      >
        {enviando ? "Excluindo…" : "Excluir"}
      </button>
      {erro && <span className="block text-xs text-red-700">{erro}</span>}
    </>
  );
}
