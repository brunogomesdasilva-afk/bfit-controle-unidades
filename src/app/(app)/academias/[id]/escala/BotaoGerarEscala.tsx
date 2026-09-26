"use client";

import { useState, useTransition } from "react";
import type { ResultadoEscala } from "./actions";

export function BotaoGerarEscala({ gerar, temEscala }: { gerar: () => Promise<ResultadoEscala>; temEscala: boolean }) {
  const [gerando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoEscala | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={gerando}
        onClick={() => {
          if (
            temEscala &&
            !window.confirm(
              "Gerar a escala de novo? Os turnos de hoje até 31/12 serão refeitos; os que já passaram ficam como estão."
            )
          )
            return;
          setResultado(null);
          iniciar(async () => setResultado(await gerar()));
        }}
        className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-60"
      >
        {gerando ? "Gerando…" : temEscala ? "Gerar escala de novo" : "Gerar escala"}
      </button>
      {resultado?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
      {resultado?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
      {resultado?.avisos && resultado.avisos.length > 0 && (
        <ul className="mt-2 list-disc rounded-md bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
          {resultado.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
