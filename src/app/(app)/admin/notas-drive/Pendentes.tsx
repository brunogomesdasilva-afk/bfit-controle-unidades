"use client";

import { useState, useTransition } from "react";
import { Escolha } from "../../financeiro/componentes";
import { lancarPendente } from "./actions";
import { Situacao } from "./FormNotasDrive";

// Notas que o robô não conseguiu lançar sozinho porque faltou a categoria (fornecedor sem categoria padrão) e/ou o
// vencimento (a nota não traz). Aqui se informa o que falta e se clica em Lançar: a nota é lançada e vai para a
// pasta da contabilidade, e a categoria fica gravada no fornecedor para as próximas notas dele.

export type NotaPendente = {
  arquivoId: string;
  arquivo: string;
  fornecedor: string;
  academia: string;
  numero: string;
  emissao: string | null;
  valor: number;
  categoriaId: string | null; // a do fornecedor, se ele já tiver
  semVencimento: boolean;
  motivo: string;
};
type Opcao = { valor: string; rotulo: string; grupo?: string };

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Linha({ p, categorias, podeLancar }: { p: NotaPendente; categorias: Opcao[]; podeLancar: boolean }) {
  const [categoria, setCategoria] = useState(p.categoriaId ?? "");
  const [vencimento, setVencimento] = useState("");
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [lancando, iniciar] = useTransition();
  const completo = Boolean(categoria) && (!p.semVencimento || Boolean(vencimento));
  const lancar = () =>
    iniciar(async () => {
      const r = await lancarPendente(p.arquivoId, { categoriaId: categoria || undefined, vencimento: vencimento || undefined });
      setM(r);
    });

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-slate-900">{p.fornecedor}</span>
        <span className="text-slate-600">
          NF {p.numero} · emissão {dataBr(p.emissao)} · {reais(p.valor)} · {p.academia}
        </span>
        <span className="text-xs text-slate-500">{p.arquivo}</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Escolha
          rotulo={p.categoriaId ? "Categoria (do fornecedor)" : "Categoria * (fica gravada no fornecedor)"}
          valor={categoria}
          mudar={setCategoria}
          opcoes={categorias}
          className="w-full max-w-sm"
        />
        {p.semVencimento && (
          <label className="text-xs text-slate-600">
            Vencimento * (a nota não informa)
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        )}
        <button
          type="button"
          onClick={lancar}
          disabled={lancando || !completo || !podeLancar}
          className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
        >
          {lancando ? "Lançando…" : "Lançar"}
        </button>
      </div>
      {m?.erro && <p className="text-sm text-red-700">{m.erro}</p>}
      {m?.ok && <p className="text-sm text-emerald-700">{m.ok}</p>}
    </div>
  );
}

export function Pendentes({ pendentes, categorias, podeLancar, motivoSemLancar }: { pendentes: NotaPendente[]; categorias: Opcao[]; podeLancar: boolean; motivoSemLancar: string }) {
  if (!pendentes.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        Notas pendentes <Situacao s="pendente" />
        <span className="font-normal text-slate-500">· informe o que falta e clique em Lançar</span>
      </h2>
      {!podeLancar && <p className="text-xs text-slate-500">{motivoSemLancar}</p>}
      {pendentes.map((p) => (
        <Linha key={p.arquivoId} p={p} categorias={categorias} podeLancar={podeLancar} />
      ))}
    </section>
  );
}
