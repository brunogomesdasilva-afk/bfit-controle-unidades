"use client";

import { useState, useTransition } from "react";
import type { ResultadoBackup } from "./actions";

export function BotaoBackup({ fazer }: { fazer: () => Promise<ResultadoBackup> }) {
  const [rodando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoBackup | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={rodando}
        onClick={() => {
          if (!window.confirm("Fazer o backup agora? Enquanto ele roda, só você consegue acessar e lançar no sistema.")) return;
          setResultado(null);
          iniciar(async () => {
            const r = await fazer();
            setResultado(r);
            if (r.url) window.location.href = r.url;
          });
        }}
        className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-60"
      >
        {rodando ? "Fazendo backup… não feche esta página" : "Fazer backup agora"}
      </button>
      {resultado?.erro && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
      {resultado?.ok && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
      {resultado?.aviso && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{resultado.aviso}</p>}
      {resultado?.url && (
        <p className="mt-2 text-sm">
          Se o download não começar,{" "}
          <a href={resultado.url} className="font-medium text-marca underline">
            clique aqui
          </a>
          .
        </p>
      )}
    </div>
  );
}

export function BotaoLiberar({ liberar }: { liberar: () => Promise<ResultadoBackup> }) {
  const [rodando, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={rodando}
      onClick={() => iniciar(async () => void (await liberar()))}
      className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
    >
      {rodando ? "Liberando…" : "Liberar o sistema"}
    </button>
  );
}
