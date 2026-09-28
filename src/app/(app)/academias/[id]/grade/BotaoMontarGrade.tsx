"use client";

import { useState, useTransition } from "react";

type Resultado = { erro?: string; ok?: string };

export function BotaoMontarGrade({ montar, temGrade }: { montar: () => Promise<Resultado>; temGrade: boolean }) {
  const [rodando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={rodando}
        onClick={() => {
          const aviso = temGrade
            ? "Refazer a grade a partir das contagens das últimas 8 semanas? A grade atual será substituída."
            : "Montar a grade a partir das contagens das últimas 8 semanas?";
          if (!window.confirm(aviso)) return;
          setResultado(null);
          iniciar(async () => setResultado(await montar()));
        }}
        className="rounded-md border border-marca bg-white px-3 py-2 text-sm font-medium text-marca hover:bg-slate-50 disabled:opacity-50"
      >
        {rodando ? "Montando…" : temGrade ? "Refazer grade pelas contagens" : "Montar grade pelas contagens"}
      </button>
      {resultado?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
      {resultado?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
    </div>
  );
}
