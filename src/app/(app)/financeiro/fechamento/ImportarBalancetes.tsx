"use client";

import { useRef, useState } from "react";
import { interpretarNome, nomeMes } from "@/lib/nomeBalancete";
import type { ResultadoImportacao } from "./actions";

// Importação dos balancetes: escolhe um ou mais arquivos; academia, mês e ano vêm do nome do arquivo
// (ex.: "Novo Osasco 08 2026.xlsx") e podem ser corrigidos antes de importar.

type Item = { arquivo: File; academia: string; ano: string; mesInicio: string; mesFim: string; resultado?: ResultadoImportacao };
const CAMPO = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";

export function ImportarBalancetes({
  academias,
  academiaPadrao,
  importar,
}: {
  academias: { id: string; nome: string }[];
  academiaPadrao: string | null;
  importar: (formData: FormData) => Promise<ResultadoImportacao>;
}) {
  const campo = useRef<HTMLInputElement | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [enviando, setEnviando] = useState(false);

  function escolher(arquivos: FileList | null) {
    setItens(
      [...(arquivos ?? [])].map((arquivo) => {
        const n = interpretarNome(arquivo.name, academias);
        return {
          arquivo,
          academia: n.academiaId ?? academiaPadrao ?? "",
          ano: n.ano ? String(n.ano) : "",
          mesInicio: n.mes ? String(n.mes) : "",
          mesFim: n.mes ? String(n.mes) : "",
        };
      })
    );
  }
  const alterar = (i: number, dados: Partial<Item>) => setItens(itens.map((it, j) => (j === i ? { ...it, ...dados, resultado: undefined } : it)));

  async function enviar() {
    setEnviando(true);
    const novos = [...itens];
    for (let i = 0; i < novos.length; i++) {
      if (novos[i].resultado?.ok) continue;
      const f = new FormData();
      f.set("arquivo", novos[i].arquivo);
      f.set("academia", novos[i].academia);
      f.set("ano", novos[i].ano);
      f.set("mes_inicio", novos[i].mesInicio);
      f.set("mes_fim", novos[i].mesFim);
      novos[i] = { ...novos[i], resultado: await importar(f).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) })) };
      setItens([...novos]);
    }
    setEnviando(false);
    if (novos.every((n) => n.resultado?.ok) && campo.current) campo.current.value = "";
  }

  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Importar balancete da contabilidade</h2>
        <p className="text-xs text-slate-500">
          Excel do balancete (Conta contábil, Descrição, Saldo anterior, Débito, Crédito, Saldo atual), um por academia e
          mês. Coloque no nome do arquivo a academia, o mês e o ano (ex.: &quot;Novo Osasco 08 2026.xlsx&quot;). O mesmo mês
          importado de novo substitui o anterior.
        </p>
      </div>
      <input
        ref={campo}
        type="file"
        multiple
        accept=".xlsx,.xls"
        disabled={enviando}
        onChange={(e) => escolher(e.target.files)}
        className="block text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      {itens.length > 0 && (
        <div className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="rounded-md border border-slate-100 p-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-48 font-medium text-slate-800">{it.arquivo.name}</span>
                <select value={it.academia} onChange={(e) => alterar(i, { academia: e.target.value })} className={CAMPO} disabled={enviando}>
                  <option value="">Academia…</option>
                  {academias.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
                <select value={it.mesInicio} onChange={(e) => alterar(i, { mesInicio: e.target.value, mesFim: !it.mesFim || Number(e.target.value) > Number(it.mesFim) ? e.target.value : it.mesFim })} className={CAMPO} disabled={enviando}>
                  <option value="">De…</option>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {nomeMes(m)}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500">a</span>
                <select value={it.mesFim} onChange={(e) => alterar(i, { mesFim: e.target.value })} className={CAMPO} disabled={enviando}>
                  <option value="">Até…</option>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {nomeMes(m)}
                    </option>
                  ))}
                </select>
                <input value={it.ano} onChange={(e) => alterar(i, { ano: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Ano" className={`${CAMPO} w-20`} disabled={enviando} />
              </div>
              {it.resultado?.erro && <p className="mt-1 text-xs text-red-700">{it.resultado.erro}</p>}
              {it.resultado?.ok && <p className="mt-1 text-xs text-emerald-700">{it.resultado.ok}</p>}
              {it.resultado?.aviso && <p className="mt-1 text-xs text-amber-800">{it.resultado.aviso}</p>}
            </div>
          ))}
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || itens.some((it) => !it.academia || !it.ano || !it.mesInicio || !it.mesFim)}
            className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
          >
            {enviando ? "Importando…" : itens.length > 1 ? `Importar ${itens.length} balancetes` : "Importar balancete"}
          </button>
        </div>
      )}
    </div>
  );
}
