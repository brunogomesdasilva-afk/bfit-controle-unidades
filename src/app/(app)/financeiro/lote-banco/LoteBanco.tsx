"use client";

import { useState, useTransition } from "react";
import type { ItemLote } from "@/lib/loteBanco";
import { arquivoDoLote, gerarLoteBanco } from "./acoes";

// Lista dos títulos do lote (só os que têm forma de pagamento/cadastro completo podem ser marcados), totais e o
// botão que gera e baixa o arquivo de remessa. Embaixo, o histórico dos arquivos gerados.

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string) => d.split("-").reverse().join("/");

// Baixa o texto como arquivo .REM (o banco espera ASCII com quebra de linha CRLF, que já vem no conteúdo).
function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=us-ascii" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function LoteBanco({ tipo, contaId, itens, podeGerar }: { tipo: "pagar" | "receber"; contaId: string; itens: ItemLote[]; podeGerar: boolean }) {
  const validos = itens.filter((i) => !i.problema);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(validos.map((i) => i.id)));
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [gerando, iniciar] = useTransition();
  const escolhidos = validos.filter((i) => marcados.has(i.id));
  const total = escolhidos.reduce((s, i) => s + i.valor, 0);
  const alternar = (id: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const gerar = () =>
    iniciar(async () => {
      const r = await gerarLoteBanco(tipo, contaId, escolhidos.map((i) => i.id));
      setM(r);
      if (r.arquivo) baixar(r.arquivo.nome, r.arquivo.conteudo);
    });

  return (
    <div className="space-y-3">
      <div className="sem-barra overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Marcar todos"
                  checked={validos.length > 0 && validos.every((i) => marcados.has(i.id))}
                  onChange={(e) => setMarcados(e.target.checked ? new Set(validos.map((i) => i.id)) : new Set())}
                />
              </th>
              <th className="px-2 py-2">Previsão</th>
              <th className="px-2 py-2">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</th>
              <th className="px-2 py-2">NF</th>
              <th className="px-2 py-2">Vencimento</th>
              <th className="px-2 py-2">{tipo === "pagar" ? "Forma" : "Cobrança"}</th>
              <th className="px-2 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className={`border-t border-slate-100 ${i.problema ? "bg-amber-50/50 text-slate-500" : ""}`}>
                <td className="px-3 py-1.5">
                  <input type="checkbox" aria-label="Incluir no lote" disabled={Boolean(i.problema)} checked={marcados.has(i.id) && !i.problema} onChange={() => alternar(i.id)} />
                </td>
                <td className="px-2 tabular-nums">{dataBr(i.previsao)}</td>
                <td className="max-w-56 truncate px-2 font-medium text-slate-900" title={i.fornecedor}>
                  {i.fornecedor}
                </td>
                <td className="px-2">{i.documento ?? ""}</td>
                <td className="px-2 tabular-nums">{dataBr(i.vencimento)}</td>
                <td className="px-2">{i.problema ? <span className="text-xs text-amber-800">{i.problema}</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">{i.forma}</span>}</td>
                <td className="px-2 text-right tabular-nums">{reais(i.valor)}</td>
              </tr>
            ))}
            {!itens.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Nenhum título em aberto nesta conta no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={gerar}
          disabled={gerando || !podeGerar || !escolhidos.length}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
        >
          {gerando ? "Gerando…" : `Gerar arquivo (${escolhidos.length} título${escolhidos.length === 1 ? "" : "s"} · ${reais(total)})`}
        </button>
        {itens.some((i) => i.problema) && <span className="text-xs text-amber-800">{itens.filter((i) => i.problema).length} título(s) com pendência ficam de fora.</span>}
        {m?.ok && <span className="text-sm text-emerald-700">{m.ok}</span>}
        {m?.erro && <span className="text-sm text-red-700">{m.erro}</span>}
      </div>
    </div>
  );
}

type LoteGerado = { id: string; tipo: string; nsa: number; nome: string; quantidade: number; total: number; criadoEm: string; conta: string; autor: string };

LoteBanco.Historico = function Historico({ lotes }: { lotes: LoteGerado[] }) {
  const [baixando, iniciar] = useTransition();
  if (!lotes.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-900">Arquivos gerados</h2>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Arquivo</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Conta</th>
              <th className="px-3 py-2 text-right">Títulos</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">
                  {new Date(l.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                  {l.autor ? ` · ${l.autor}` : ""}
                </td>
                <td className="px-3 font-medium">
                  {l.nome} <span className="text-xs font-normal text-slate-400">nº {l.nsa}</span>
                </td>
                <td className="px-3">{l.tipo === "pagar" ? "Pagamentos" : "Cobrança"}</td>
                <td className="px-3">{l.conta}</td>
                <td className="px-3 text-right tabular-nums">{l.quantidade}</td>
                <td className="px-3 text-right tabular-nums">{reais(l.total)}</td>
                <td className="px-3 text-right">
                  <button
                    type="button"
                    disabled={baixando}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await arquivoDoLote(l.id);
                        if (r.arquivo) baixar(r.arquivo.nome, r.arquivo.conteudo);
                      })
                    }
                    className="text-xs text-marca hover:underline"
                  >
                    Baixar de novo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
