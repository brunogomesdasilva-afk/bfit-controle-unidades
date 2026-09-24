"use client";

import { useState, useTransition } from "react";
import type { ResultadoEnvio } from "./actions";

export function BotaoEnviarEmail({
  enviar,
  rotulo,
  confirmacao,
}: {
  enviar: () => Promise<ResultadoEnvio>;
  rotulo: string;
  confirmacao: string;
}) {
  const [enviando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  return (
    <div className="print:hidden">
      <button
        type="button"
        disabled={enviando}
        onClick={() => {
          if (!window.confirm(confirmacao)) return;
          setResultado(null);
          iniciar(async () => setResultado(await enviar()));
        }}
        className="rounded-md border border-marca bg-white px-3 py-2 text-sm font-medium text-marca hover:bg-slate-50 disabled:opacity-50"
      >
        {enviando ? "Enviando…" : rotulo}
      </button>
      {resultado?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
      {resultado?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
    </div>
  );
}
