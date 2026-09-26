"use client";

import { useState, useTransition } from "react";
import type { ResultadoEnvio } from "../pendencias/actions";

// "Executar fechamento": abre o PDF numa nova aba e envia o mesmo PDF por e-mail.
// A aba é aberta no clique (antes do envio) para o navegador não bloquear como pop-up.
export function BotaoFechamento({
  enviar,
  pdf,
  confirmacao,
}: {
  enviar: () => Promise<ResultadoEnvio>;
  pdf: string;
  confirmacao: string;
}) {
  const [enviando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => {
            if (!window.confirm(confirmacao)) return;
            window.open(pdf, "_blank");
            setResultado(null);
            iniciar(async () => setResultado(await enviar()));
          }}
          className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Executar fechamento"}
        </button>
        <a
          href={pdf}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-marca bg-white px-3 py-2 text-sm font-medium text-marca hover:bg-slate-50"
        >
          Só abrir o PDF
        </a>
      </div>
      {resultado?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
      {resultado?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
    </div>
  );
}
