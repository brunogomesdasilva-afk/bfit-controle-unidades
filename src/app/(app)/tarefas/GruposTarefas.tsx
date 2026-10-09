"use client";

import { useState, useTransition } from "react";
import { salvarGrupoTarefas } from "./actions";

// Grupos de usuários das tarefas (ex.: Gerentes, Operacional): uma tarefa do grupo aparece para cada membro.
type Grupo = { id: string; nome: string; membros: string[] };
type Usuario = { id: string; nome: string; descricao: string };

function EditorGrupo({ grupo, usuarios, fechar }: { grupo: Grupo | null; usuarios: Usuario[]; fechar: () => void }) {
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [membros, setMembros] = useState<Set<string>>(new Set(grupo?.membros ?? []));
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="space-y-3 rounded-lg border border-marca/30 bg-white p-4">
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do grupo (ex.: Gerentes)" className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {usuarios.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={membros.has(u.id)}
              onChange={() => {
                const n = new Set(membros);
                if (n.has(u.id)) n.delete(u.id);
                else n.add(u.id);
                setMembros(n);
              }}
            />
            {u.nome}
            <span className="text-xs text-slate-500">{u.descricao}</span>
          </label>
        ))}
      </div>
      {m?.erro && <p className="text-sm text-red-700">{m.erro}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarGrupoTarefas(grupo?.id ?? null, nome, [...membros]);
              setM(r);
              if (r.ok) fechar();
            })
          }
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
        >
          Salvar grupo
        </button>
        <button type="button" onClick={fechar} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function GruposTarefas({ grupos, usuarios }: { grupos: Grupo[]; usuarios: Usuario[] }) {
  const [editando, setEditando] = useState<Grupo | "novo" | null>(null);
  const nome = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? "(inativo)";
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Grupos de usuários</h2>
        {!editando && (
          <button type="button" onClick={() => setEditando("novo")} className="text-sm font-medium text-marca hover:underline">
            + Novo grupo
          </button>
        )}
      </div>
      {editando && <EditorGrupo key={editando === "novo" ? "novo" : editando.id} grupo={editando === "novo" ? null : editando} usuarios={usuarios} fechar={() => setEditando(null)} />}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
        {grupos.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              <strong className="font-medium text-slate-900">{g.nome}</strong>
              <span className="text-slate-500"> · {g.membros.length ? g.membros.map(nome).join(", ") : "sem membros"}</span>
            </span>
            <button type="button" onClick={() => setEditando(g)} className="text-xs text-slate-600 underline hover:text-slate-900">
              Alterar
            </button>
          </li>
        ))}
        {grupos.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhum grupo.</li>}
      </ul>
    </section>
  );
}
