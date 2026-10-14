"use client";

import { useState, useTransition } from "react";
import { enviarRegraAgora, excluirRegra, salvarRegra, type DadosRegra } from "./actions";

type Pessoa = { id: string; nome: string; perfil: string; temWhatsapp: boolean; temEmail: boolean };
type Grupo = { id: string; nome: string };

const RELATORIOS: [DadosRegra["relatorio"], string][] = [
  ["manutencao", "Manutenções pendentes"],
  ["compras", "Compras pendentes"],
  ["acompanhamento", "Acompanhamento diário"],
  ["semanal", "Relatório semanal"],
];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const campo = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const rotulo = "text-xs font-medium text-slate-600";

const VAZIA: DadosRegra = {
  nome: "",
  relatorio: "manutencao",
  canal: "whatsapp",
  grupo_id: null,
  grupo_nome: null,
  para_admins: false,
  usuarios: [],
  dias: "uteis",
  dias_semana: [],
  hora: 8,
  com_faturamento: true,
  ativo: false,
};

// Uma regra de envio automático (ou, sem id, o formulário de nova regra).
export function FormRegra({
  id,
  inicial,
  ultimoResultado,
  quando,
  pessoas,
  grupos,
  erroGrupos,
}: {
  id: string | null;
  inicial?: DadosRegra;
  ultimoResultado?: string | null;
  quando?: string;
  pessoas: Pessoa[];
  grupos: Grupo[];
  erroGrupos: string | null;
}) {
  const [d, setD] = useState<DadosRegra>(inicial ?? VAZIA);
  const [aberto, setAberto] = useState(!id);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const mudar = (parcial: Partial<DadosRegra>) => setD((atual) => ({ ...atual, ...parcial }));
  const rodar = (acao: () => Promise<{ erro?: string; ok?: string }>) => {
    setMsg(null);
    iniciar(async () => {
      const r = await acao();
      setMsg(r);
      if (!id && r.ok) setD(VAZIA);
    });
  };
  const grupoNaLista = grupos.some((g) => g.id === d.grupo_id);
  const pessoasDoCanal = pessoas.filter((p) => (d.canal === "whatsapp" ? p.temWhatsapp : p.temEmail));

  if (id && !aberto)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">
              {d.nome}{" "}
              <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${d.ativo ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                {d.ativo ? "Ativa" : "Desligada"}
              </span>
            </p>
            <p className="text-sm text-slate-600">
              {quando} · {d.canal === "whatsapp" ? "WhatsApp" : "E-mail"}
              {d.canal === "whatsapp" && d.grupo_id ? ` · grupo ${d.grupo_nome ?? d.grupo_id}` : ""}
              {d.para_admins ? " · administradores" : ""}
              {d.usuarios.length ? ` · ${d.usuarios.length} pessoa(s)` : ""}
            </p>
            {ultimoResultado && <p className="mt-1 text-xs text-slate-500">Último: {ultimoResultado}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAberto(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Editar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => window.confirm(`Enviar "${d.nome}" agora para os destinos da regra?`) && rodar(() => enviarRegraAgora(id))}
              className="rounded-md border border-marca px-3 py-1.5 text-sm font-medium text-marca hover:bg-slate-50 disabled:opacity-50"
            >
              {ocupado ? "Enviando…" : "Enviar agora"}
            </button>
          </div>
        </div>
        {msg?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg.erro}</p>}
        {msg?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>}
      </div>
    );

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarRegra(id, d));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={rotulo}>
          Nome da regra
          <input value={d.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="ex.: Manutenções - grupo da manutenção" className={campo} />
        </label>
        <label className={rotulo}>
          Relatório
          <select value={d.relatorio} onChange={(e) => mudar({ relatorio: e.target.value as DadosRegra["relatorio"] })} className={campo}>
            {RELATORIOS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Canal
          <select value={d.canal} onChange={(e) => mudar({ canal: e.target.value as DadosRegra["canal"] })} className={campo}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
        </label>
        {d.relatorio === "acompanhamento" && (
          <label className={rotulo}>
            Versão do PDF
            <select value={d.com_faturamento ? "1" : "0"} onChange={(e) => mudar({ com_faturamento: e.target.value === "1" })} className={campo}>
              <option value="1">Completa (com faturamento)</option>
              <option value="0">Sem faturamento</option>
            </select>
          </label>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className={rotulo}>Para quem</legend>
        {d.canal === "whatsapp" && (
          <div>
            <select
              value={d.grupo_id ?? ""}
              onChange={(e) => mudar({ grupo_id: e.target.value || null, grupo_nome: grupos.find((g) => g.id === e.target.value)?.nome ?? null })}
              className={campo}
            >
              <option value="">Nenhum grupo</option>
              {d.grupo_id && !grupoNaLista && <option value={d.grupo_id}>{d.grupo_nome ?? d.grupo_id} (salvo)</option>}
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  Grupo: {g.nome}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {erroGrupos
                ? `Não foi possível listar os grupos (${erroGrupos}).`
                : "Só aparecem os grupos de que o número conectado participa. Grupo novo: adicione o número ao grupo e recarregue a página."}
            </p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.para_admins} onChange={(e) => mudar({ para_admins: e.target.checked })} />
          Todos os administradores (cada um no seu {d.canal === "whatsapp" ? "WhatsApp" : "e-mail"})
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-700">Pessoas escolhidas ({d.usuarios.length})</summary>
          <div className="mt-2 grid max-h-56 gap-1 overflow-auto sm:grid-cols-2">
            {pessoasDoCanal.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.usuarios.includes(p.id)}
                  onChange={(e) => mudar({ usuarios: e.target.checked ? [...d.usuarios, p.id] : d.usuarios.filter((u) => u !== p.id) })}
                />
                {p.nome}
              </label>
            ))}
            {!pessoasDoCanal.length && <p className="text-slate-500">Ninguém com {d.canal === "whatsapp" ? "WhatsApp" : "e-mail"} no cadastro.</p>}
          </div>
        </details>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className={rotulo}>Dias</legend>
          <select value={d.dias} onChange={(e) => mudar({ dias: e.target.value as DadosRegra["dias"] })} className={campo}>
            <option value="uteis">Dias úteis (sem sábado, domingo e feriado nacional)</option>
            <option value="semana">Dias da semana escolhidos</option>
          </select>
          {d.dias === "semana" && (
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {DIAS.map((nome, i) => (
                <label key={nome} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={d.dias_semana.includes(i)}
                    onChange={(e) => mudar({ dias_semana: e.target.checked ? [...d.dias_semana, i] : d.dias_semana.filter((x) => x !== i) })}
                  />
                  {nome}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label className={rotulo}>
          Hora (Brasília)
          <select value={d.hora} onChange={(e) => mudar({ hora: Number(e.target.value) })} className={campo}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={d.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
        Ativa (envia automaticamente)
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupado} className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
          {ocupado ? "Salvando…" : id ? "Salvar" : "Criar regra"}
        </button>
        {id && (
          <>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
              Fechar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => window.confirm(`Excluir a regra "${d.nome}"?`) && rodar(() => excluirRegra(id))}
              className="ml-auto rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Excluir
            </button>
          </>
        )}
      </div>
      {msg?.erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>}
    </form>
  );
}
