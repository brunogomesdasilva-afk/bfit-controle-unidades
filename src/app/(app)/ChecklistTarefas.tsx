"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import type { Pendente } from "@/lib/tarefas";
import { marcarTarefa } from "./tarefasActions";

// Checklist de tarefas do usuário. Abre no meio da tela a cada login enquanto houver tarefa pendente; fechado
// ("Lembrar depois"), volta no próximo login. Até tudo ser marcado, fica um aviso no topo de todas as telas.

const nadaMuda = () => () => {};

export function ChecklistTarefas({ sessao, pendentes }: { sessao: string; pendentes: Pendente[] }) {
  const chave = `checklist_visto_${sessao}`;
  // Já fechado neste login? (lido do navegador; no servidor considera fechado para não piscar a tela)
  const vistoNoLogin = useSyncExternalStore(
    nadaMuda,
    () => {
      try {
        return localStorage.getItem(chave) === "1";
      } catch {
        return false;
      }
    },
    () => true
  );
  const [fechado, setFechado] = useState(false);
  const [reaberto, setReaberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  if (!pendentes.length) return null;
  const aberto = reaberto || (!vistoNoLogin && !fechado);

  function fechar() {
    try {
      localStorage.setItem(chave, "1");
    } catch {}
    setFechado(true);
    setReaberto(false);
  }

  function marcar(id: string) {
    setErro(null);
    setMarcando(id);
    iniciar(async () => {
      const r = await marcarTarefa(id);
      if (r.erro) setErro(r.erro);
      setMarcando(null);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setReaberto(true)}
        className="mb-4 flex w-full items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100 print:hidden"
      >
        <span>
          <strong>
            {pendentes.length === 1 ? "1 tarefa pendente" : `${pendentes.length} tarefas pendentes`}
          </strong>
          : {pendentes.map((p) => p.titulo).join(" · ")}
        </span>
        <span className="shrink-0 font-medium underline">Abrir checklist</span>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 print:hidden" onClick={fechar}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-titulo"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="checklist-titulo" className="text-lg font-semibold text-slate-900">
                Suas tarefas
              </h2>
              <p className="text-sm text-slate-600">Marque cada tarefa assim que fizer. Enquanto não marcar, ela volta a aparecer.</p>
            </div>
            <ul className="space-y-2 overflow-auto px-5 py-4">
              {pendentes.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={marcando === p.id}
                      disabled={marcando !== null}
                      onChange={() => marcar(p.id)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-marca"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-slate-900">{p.titulo}</span>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{p.rotuloPeriodo}</span>
                      {p.descricao && <span className="mt-1 block text-slate-600">{p.descricao}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {erro && <p className="mx-5 mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
            <div className="border-t border-slate-200 px-5 py-3 text-right">
              <button type="button" onClick={fechar} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Lembrar depois
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
