"use client";

import { useState, useTransition } from "react";
import { enviarFechamentoSemanal } from "./actions";

// canal: "WhatsApp" ou "e-mail" (NOTIFY_CHANNEL, lido no servidor pela página).
export function BotaoEnviar({ referencia, canal }: { referencia: string; canal: string }) {
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={enviando}
        onClick={() => iniciar(async () => setM(await enviarFechamentoSemanal(referencia)))}
        className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
      >
        {enviando ? "Enviando…" : `Enviar por ${canal}`}
      </button>
      {m?.ok && <span className="text-sm text-emerald-700">{m.ok}</span>}
      {m?.erro && <span className="text-sm text-red-700">{m.erro}</span>}
    </span>
  );
}
