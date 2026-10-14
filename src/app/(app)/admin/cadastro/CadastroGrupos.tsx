"use client";

import { useState, useTransition } from "react";
import { excluirGrupo, salvarGrupo } from "./actions";

type Cadastrado = { id: string; nome: string; grupo_id: string };
type Grupo = { id: string; nome: string };

const campo = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

// Grupos de WhatsApp: os cadastrados (editar/excluir), um formulário para cadastrar pelo ID e, se a Z-API responder,
// os grupos do número conectado com o botão "Cadastrar" (sem precisar copiar o ID).
export function CadastroGrupos({ cadastrados, doWhatsapp, erroWhatsapp }: { cadastrados: Cadastrado[]; doWhatsapp: Grupo[]; erroWhatsapp: string | null }) {
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [novo, setNovo] = useState({ nome: "", grupo_id: "" });
  const [editando, setEditando] = useState<Cadastrado | null>(null);
  const rodar = (acao: () => Promise<{ erro?: string; ok?: string }>, depois?: () => void) => {
    setMsg(null);
    iniciar(async () => {
      const r = await acao();
      setMsg(r);
      if (r.ok) depois?.();
    });
  };
  const jaCadastrados = new Set(cadastrados.map((c) => c.grupo_id));
  const naoCadastrados = doWhatsapp.filter((g) => !jaCadastrados.has(g.id));

  return (
    <div className="space-y-5">
      {msg?.erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>}

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Grupos cadastrados ({cadastrados.length})</h2>
        {!cadastrados.length && <p className="px-4 py-3 text-sm text-slate-500">Nenhum grupo cadastrado ainda.</p>}
        <ul className="divide-y divide-slate-100">
          {cadastrados.map((c) =>
            editando?.id === c.id ? (
              <li key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-xs text-slate-600">
                  Nome
                  <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className={campo} />
                </label>
                <label className="text-xs text-slate-600">
                  ID do grupo
                  <input value={editando.grupo_id} onChange={(e) => setEditando({ ...editando, grupo_id: e.target.value })} className={campo} />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => rodar(() => salvarGrupo(c.id, editando), () => setEditando(null))}
                    className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                    Cancelar
                  </button>
                </div>
              </li>
            ) : (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{c.nome}</p>
                  <p className="font-mono text-xs text-slate-500">{c.grupo_id}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditando(c)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => window.confirm(`Remover "${c.nome}" do cadastro?`) && rodar(() => excluirGrupo(c.id))}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      </section>

      <form
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarGrupo(null, novo), () => setNovo({ nome: "", grupo_id: "" }));
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Cadastrar grupo pelo ID</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            Nome
            <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="ex.: Gerentes BFIT" className={campo} />
          </label>
          <label className="text-xs text-slate-600">
            ID do grupo
            <input value={novo.grupo_id} onChange={(e) => setNovo({ ...novo, grupo_id: e.target.value })} placeholder="ex.: 120363019502650977-group" className={campo} />
          </label>
        </div>
        <button type="submit" disabled={ocupado} className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
          {ocupado ? "Salvando…" : "Cadastrar"}
        </button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Grupos do WhatsApp conectado</h2>
        <p className="px-4 pt-3 text-xs text-slate-500">
          Os grupos de que o número que envia (Z-API) participa. Clique em &quot;Cadastrar&quot; para guardar o grupo com o nome e o ID dele. Grupo novo: adicione
          o número ao grupo e recarregue a página.
        </p>
        {erroWhatsapp && <p className="px-4 py-3 text-sm text-amber-800">Não foi possível listar os grupos ({erroWhatsapp}). Cadastre pelo ID acima.</p>}
        {!erroWhatsapp && !naoCadastrados.length && <p className="px-4 py-3 text-sm text-slate-500">Todos os grupos do WhatsApp já estão cadastrados.</p>}
        <ul className="divide-y divide-slate-100">
          {naoCadastrados.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{g.nome}</p>
                <p className="font-mono text-xs text-slate-500">{g.id}</p>
              </div>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => rodar(() => salvarGrupo(null, { nome: g.nome, grupo_id: g.id }))}
                className="rounded-md border border-marca px-3 py-1.5 font-medium text-marca hover:bg-slate-50 disabled:opacity-50"
              >
                Cadastrar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
