"use client";

import { useState, useTransition } from "react";
import type { ResultadoNota } from "@/lib/nfDrive";
import { rodarAgora, salvarPastas } from "./actions";

const SITUACAO: Record<ResultadoNota["situacao"], [string, string]> = {
  lancada: ["Lançada", "bg-emerald-100 text-emerald-800"],
  ja_lancada: ["Já lançada", "bg-sky-100 text-sky-800"],
  pendente: ["Pendente", "bg-amber-100 text-amber-900"],
  erro: ["Erro", "bg-red-100 text-red-800"],
};
export function Situacao({ s }: { s: ResultadoNota["situacao"] }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SITUACAO[s][1]}`}>{SITUACAO[s][0]}</span>;
}

export function FormNotasDrive({ inicial, podeRodar }: { inicial: { notas: string; contabilidade: string; ativo: boolean }; podeRodar: boolean }) {
  const [d, setD] = useState(inicial);
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [execucao, setExecucao] = useState<Awaited<ReturnType<typeof rodarAgora>> | null>(null);
  const [salvando, iniciarSalvar] = useTransition();
  const [rodando, iniciarRodar] = useTransition();
  const campo = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Pasta de notas fiscais (link da pasta no Google Drive ou caminho da pasta no computador)
          <input value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} placeholder="https://drive.google.com/drive/folders/… ou C:\Users\…" className={campo} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Pasta de fechamento da contabilidade (link da pasta no Google Drive ou caminho da pasta no computador)
          <input value={d.contabilidade} onChange={(e) => setD({ ...d, contabilidade: e.target.value })} placeholder="https://drive.google.com/drive/folders/… ou C:\Users\…" className={campo} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} className="h-4 w-4 accent-marca" />
          Rodar automaticamente todos os dias às 19h
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={salvando}
            onClick={() => iniciarSalvar(async () => setM(await salvarPastas(d)))}
            className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
          >
            {salvando ? "Conferindo as pastas…" : "Salvar"}
          </button>
          <button
            type="button"
            disabled={rodando || !podeRodar}
            onClick={() => iniciarRodar(async () => setExecucao(await rodarAgora()))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title={podeRodar ? "Faz agora o que o robô faz às 19h" : "Salve as duas pastas primeiro"}
          >
            {rodando ? "Lendo as notas… (pode levar alguns minutos)" : "Rodar agora"}
          </button>
          {m?.ok && <span className="text-sm text-emerald-700">{m.ok}</span>}
          {m?.erro && <span className="text-sm text-red-700">{m.erro}</span>}
        </div>
      </div>

      {execucao && (
        <div className="rounded-lg border border-marca/30 bg-white p-4 text-sm">
          {execucao.erro && <p className="text-red-700">{execucao.erro}</p>}
          {execucao.aviso && <p className="text-amber-800">{execucao.aviso}</p>}
          {execucao.resultados && (
            <>
              <p className="mb-2 font-medium text-slate-900">
                {execucao.resultados.length ? `${execucao.resultados.length} notas lidas agora` : "Nenhuma nota na pasta."}
                {execucao.restantes ? ` · ${execucao.restantes} ficaram para a próxima execução` : ""}
              </p>
              <ul className="space-y-1">
                {execucao.resultados.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <Situacao s={r.situacao} />
                    <span className="font-medium text-slate-800">{r.arquivo}</span>
                    <span className="text-slate-500">{r.destino ? `→ ${r.destino}` : r.motivo}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
