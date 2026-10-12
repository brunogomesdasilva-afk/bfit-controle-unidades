"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { Grupo } from "@/lib/financeiro";
import { salvarCategoria, salvarGrupo } from "../../acoes";

// Plano de contas em árvore (como no Omie): cada grupo é uma linha de título que abre e fecha, com as categorias
// recuadas embaixo. Abas separam receber, pagar e transferências; a busca filtra as categorias. Tudo se edita na
// própria linha: renomear, mover de grupo, inativar e incluir.

export type CategoriaArvore = { id: string; nome: string; grupo_id: string; ativo: boolean; usos: number };
type Tipo = Grupo["tipo"];

const ABAS: { tipo: Tipo; rotulo: string }[] = [
  { tipo: "receita", rotulo: "Contas a receber" },
  { tipo: "despesa", rotulo: "Contas a pagar" },
  { tipo: "transferencia", rotulo: "Transferências" },
];
const BOTAO = "rounded px-2 py-1 text-xs font-medium disabled:opacity-50";
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Edição na linha: um nome e, para categoria, o grupo.
type Edicao = { alvo: "grupo" | "categoria"; id: string | null; nome: string; grupoId: string };

export function ArvoreCategorias({ grupos, categorias }: { grupos: Grupo[]; categorias: CategoriaArvore[] }) {
  const abasComDados = ABAS.filter((a) => a.tipo !== "transferencia" || grupos.some((g) => g.tipo === "transferencia"));
  const [aba, setAba] = useState<Tipo>("receita");
  const [busca, setBusca] = useState("");
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const gruposDaAba = grupos.filter((g) => g.tipo === aba && (mostrarInativas || g.ativo));
  const termo = normalizar(busca.trim());
  const porGrupo = useMemo(() => {
    const m = new Map<string, CategoriaArvore[]>();
    for (const c of categorias) {
      if (!mostrarInativas && !c.ativo) continue;
      if (termo && !normalizar(c.nome).includes(termo)) continue;
      m.set(c.grupo_id, [...(m.get(c.grupo_id) ?? []), c]);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return m;
  }, [categorias, mostrarInativas, termo]);
  // Com busca, só os grupos que têm categoria encontrada (ou cujo nome bate).
  const visiveis = termo ? gruposDaAba.filter((g) => porGrupo.has(g.id) || normalizar(g.nome).includes(termo)) : gruposDaAba;
  const totalAba = (t: Tipo) => categorias.filter((c) => grupos.find((g) => g.id === c.grupo_id)?.tipo === t && c.ativo).length;

  const alternar = (id: string) =>
    setFechados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function executar(acao: () => Promise<{ erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      else setEdicao(null);
    });
  }
  const salvarEdicao = () => {
    if (!edicao) return;
    if (edicao.alvo === "grupo") {
      const g = grupos.find((x) => x.id === edicao.id);
      executar(() => salvarGrupo(edicao.id, { nome: edicao.nome, tipo: g?.tipo ?? aba, ativo: g && !g.ativo ? "nao" : "sim" }));
    } else {
      const c = categorias.find((x) => x.id === edicao.id);
      executar(() => salvarCategoria(edicao.id, { nome: edicao.nome, grupo_id: edicao.grupoId, ativo: c && !c.ativo ? "nao" : "sim" }));
    }
  };
  const alternarGrupo = (g: Grupo) => executar(() => salvarGrupo(g.id, { nome: g.nome, tipo: g.tipo, ativo: g.ativo ? "nao" : "sim" }));
  const alternarCategoria = (c: CategoriaArvore) =>
    executar(() => salvarCategoria(c.id, { nome: c.nome, grupo_id: c.grupo_id, ativo: c.ativo ? "nao" : "sim" }));

  const campoNome = (
    <input
      autoFocus
      value={edicao?.nome ?? ""}
      onChange={(e) => setEdicao((x) => (x ? { ...x, nome: e.target.value } : x))}
      onKeyDown={(e) => {
        if (e.key === "Enter") salvarEdicao();
        if (e.key === "Escape") setEdicao(null);
      }}
      className="w-full min-w-48 rounded border border-slate-300 px-2 py-1 text-sm"
    />
  );
  const botoesEdicao = (
    <span className="flex gap-1">
      <button type="button" onClick={salvarEdicao} disabled={salvando} className={`${BOTAO} bg-marca text-white hover:bg-marca-escuro`}>
        Salvar
      </button>
      <button type="button" onClick={() => setEdicao(null)} className={`${BOTAO} text-slate-600 hover:bg-slate-100`}>
        Cancelar
      </button>
    </span>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        {abasComDados.map((a) => (
          <button
            key={a.tipo}
            type="button"
            onClick={() => {
              setAba(a.tipo);
              setEdicao(null);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${aba === a.tipo ? "border-marca text-marca" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {a.rotulo} <span className="text-xs font-normal text-slate-400">({totalAba(a.tipo)})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria…"
          className="w-64 max-w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
          Mostrar inativas
        </label>
        <span className="flex gap-1 text-xs">
          <button type="button" onClick={() => setFechados(new Set())} className={`${BOTAO} text-slate-600 hover:bg-slate-100`}>
            Expandir tudo
          </button>
          <button type="button" onClick={() => setFechados(new Set(gruposDaAba.map((g) => g.id)))} className={`${BOTAO} text-slate-600 hover:bg-slate-100`}>
            Recolher tudo
          </button>
        </span>
        <button
          type="button"
          onClick={() => setEdicao({ alvo: "grupo", id: null, nome: "", grupoId: "" })}
          className={`${BOTAO} ml-auto border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50`}
        >
          + Novo grupo
        </button>
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Categoria</th>
              <th className="w-28 px-3 py-2 text-right">Lançamentos</th>
              <th className="w-24 px-3 py-2">Situação</th>
              <th className="w-56 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {edicao?.alvo === "grupo" && edicao.id === null && (
              <tr className="border-t border-slate-200 bg-emerald-50/60">
                <td className="px-3 py-2" colSpan={3}>
                  {campoNome}
                </td>
                <td className="px-3 py-2">{botoesEdicao}</td>
              </tr>
            )}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  {termo ? "Nenhuma categoria encontrada." : "Nenhum grupo nesta aba. Use “+ Novo grupo”."}
                </td>
              </tr>
            )}
            {visiveis.map((g) => {
              const lista = porGrupo.get(g.id) ?? [];
              const aberto = !!termo || !fechados.has(g.id);
              const editandoGrupo = edicao?.alvo === "grupo" && edicao.id === g.id;
              return (
                <Fragment key={g.id}>
                  <tr className={`border-t border-slate-200 ${g.ativo ? "bg-emerald-50" : "bg-slate-100 text-slate-400"}`}>
                    <td className="px-3 py-2" colSpan={editandoGrupo ? 3 : 1}>
                      {editandoGrupo ? (
                        campoNome
                      ) : (
                        <button type="button" onClick={() => alternar(g.id)} className="flex items-center gap-2 font-semibold text-slate-900">
                          <span className={`inline-block w-3 text-slate-500 transition ${aberto ? "rotate-90" : ""}`}>›</span>
                          {g.nome}
                          <span className="text-xs font-normal text-slate-500">
                            {lista.length} {lista.length === 1 ? "categoria" : "categorias"}
                          </span>
                        </button>
                      )}
                    </td>
                    {!editandoGrupo && (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{lista.reduce((s, c) => s + c.usos, 0) || ""}</td>
                        <td className="px-3 py-2">{!g.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">Inativo</span>}</td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      {editandoGrupo ? (
                        botoesEdicao
                      ) : (
                        <span className="flex gap-1">
                          <button type="button" onClick={() => setEdicao({ alvo: "grupo", id: g.id, nome: g.nome, grupoId: "" })} className={`${BOTAO} text-slate-600 hover:bg-white`}>
                            Renomear
                          </button>
                          <button type="button" onClick={() => alternarGrupo(g)} disabled={salvando} className={`${BOTAO} text-slate-600 hover:bg-white`}>
                            {g.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                  {aberto &&
                    lista.map((c) => {
                      const editando = edicao?.alvo === "categoria" && edicao.id === c.id;
                      return (
                        <tr key={c.id} className={`border-t border-slate-100 hover:bg-slate-50 ${c.ativo ? "" : "text-slate-400"}`}>
                          <td className="py-1.5 pl-10 pr-3">
                            {editando ? (
                              <span className="flex flex-wrap gap-2">
                                {campoNome}
                                <select
                                  value={edicao.grupoId}
                                  onChange={(e) => setEdicao((x) => (x ? { ...x, grupoId: e.target.value } : x))}
                                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                                  title="Mover para outro grupo"
                                >
                                  {grupos
                                    .filter((x) => x.tipo === aba && (x.ativo || x.id === c.grupo_id))
                                    .map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.nome}
                                      </option>
                                    ))}
                                </select>
                              </span>
                            ) : (
                              <button type="button" onClick={() => setEdicao({ alvo: "categoria", id: c.id, nome: c.nome, grupoId: c.grupo_id })} className="text-left hover:text-marca">
                                {c.nome}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{c.usos || ""}</td>
                          <td className="px-3 py-1.5">
                            {!c.ativo && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inativa</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            {editando ? (
                              botoesEdicao
                            ) : (
                              <span className="flex gap-1">
                                <button type="button" onClick={() => setEdicao({ alvo: "categoria", id: c.id, nome: c.nome, grupoId: c.grupo_id })} className={`${BOTAO} text-slate-600 hover:bg-slate-100`}>
                                  Editar
                                </button>
                                <button type="button" onClick={() => alternarCategoria(c)} disabled={salvando} className={`${BOTAO} text-slate-600 hover:bg-slate-100`}>
                                  {c.ativo ? "Inativar" : "Ativar"}
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {aberto && g.ativo && !termo && (
                    <tr className="border-t border-slate-100">
                      {edicao?.alvo === "categoria" && edicao.id === null && edicao.grupoId === g.id ? (
                        <>
                          <td className="py-1.5 pl-10 pr-3" colSpan={3}>
                            {campoNome}
                          </td>
                          <td className="px-3 py-1.5">{botoesEdicao}</td>
                        </>
                      ) : (
                        <td className="py-1.5 pl-10 pr-3" colSpan={4}>
                          <button type="button" onClick={() => setEdicao({ alvo: "categoria", id: null, nome: "", grupoId: g.id })} className="text-xs text-slate-400 hover:text-marca">
                            + Incluir categoria em {g.nome}
                          </button>
                        </td>
                      )}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Clique no grupo para abrir ou fechar e no nome da categoria para editar (renomear ou mover de grupo). Categoria inativa sai das listas de lançamento, mas os lançamentos
        antigos continuam com ela.
      </p>
    </div>
  );
}
