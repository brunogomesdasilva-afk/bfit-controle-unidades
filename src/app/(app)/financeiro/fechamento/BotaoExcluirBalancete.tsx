"use client";

import { useTransition } from "react";
import type { ResultadoImportacao } from "./actions";

export function BotaoExcluirBalancete({ id, rotulo, excluir }: { id: string; rotulo: string; excluir: (id: string) => Promise<ResultadoImportacao> }) {
  const [excluindo, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={excluindo}
      onClick={() => {
        if (!window.confirm(`Excluir o balancete de ${rotulo}? O DRE, o balanço e o DFC deixam de considerá-lo.`)) return;
        iniciar(async () => {
          const r = await excluir(id);
          if (r.erro) window.alert(r.erro);
        });
      }}
      className="text-xs text-red-700 underline hover:text-red-800 disabled:opacity-50"
    >
      {excluindo ? "Excluindo…" : "Excluir"}
    </button>
  );
}
