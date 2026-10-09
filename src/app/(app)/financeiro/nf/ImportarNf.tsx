"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { proximoDiaUtil } from "@/lib/diasUteis";
import { dataBr, formatarDocumento, reais, somarMeses } from "@/lib/financeiro";
import type { NotaLida } from "@/lib/lerNotaFiscal";
import { createClient } from "@/lib/supabase/client";
import { lancarNotaFiscal } from "../acoes";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CampoMoeda, Escolha, Mensagem, Rotulo, Texto, formatarMoeda } from "../componentes";

// Importar NF: o PDF é lido pelo Claude; a tela mostra o que foi lido para conferir, cadastra o fornecedor novo
// (pedindo a categoria, que fica como padrão dele) e, se a nota não traz vencimento ou condição de pagamento,
// pede a data e a forma (à vista ou parcelado). Vencimento fora de dia útil vai para o próximo dia útil.

type Opcao = { valor: string; rotulo: string; grupo?: string };
type Leitura = {
  nota: NotaLida;
  academia: { id: string; nome: string } | null;
  fornecedor: { id: string; razao_social: string; nome_fantasia: string | null; categoria_padrao_id: string | null; regime_tributario: string | null } | null;
  receita: { razao_social: string; nome_fantasia: string | null; situacao: string; regime: string | null; cnae: string; municipio: string } | null;
  repetidas: { id: string; vencimento: string; valor: number; academia_id: string }[];
};
type Parcela = { vencimento: string; valor: string };

const br = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string) => Number((s || "0").replace(/\./g, "").replace(",", ".")) || 0;
const hojeIso = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const RETENCOES = [
  ["ret_iss", "iss", "ISS"],
  ["ret_irrf", "irrf", "IRRF"],
  ["ret_inss", "inss", "INSS"],
  ["ret_pis", "pis", "PIS"],
  ["ret_cofins", "cofins", "COFINS"],
  ["ret_csll", "csll", "CSLL"],
] as const;

export function ImportarNf({ academias, categorias, contas, feriados }: { academias: Opcao[]; categorias: Opcao[]; contas: { id: string; nome: string; academia_id: string }[]; feriados: { data: string; academia_id: string | null }[] }) {
  const campoArquivo = useRef<HTMLInputElement | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [lendo, setLendo] = useState(false);
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [d, setD] = useState<Record<string, string>>({});
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [semVencimento, setSemVencimento] = useState(false);
  const [gravando, iniciar] = useTransition();

  const diasNaoUteis = useMemo(() => new Set(feriados.filter((f) => !f.academia_id || f.academia_id === d.academia_id).map((f) => f.data)), [feriados, d.academia_id]);
  const util = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? proximoDiaUtil(v, diasNaoUteis) : v);

  async function ler(f: File) {
    setArquivo(f);
    setLeitura(null);
    setM(null);
    setLendo(true);
    try {
      const corpo = new FormData();
      corpo.set("arquivo", f);
      const r = await fetch("/financeiro/nf/ler", { method: "POST", body: corpo });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível ler a nota.");
      const l = j as Leitura;
      setLeitura(l);
      const n = l.nota;
      setD({
        academia_id: l.academia?.id ?? "",
        categoria_id: l.fornecedor?.categoria_padrao_id ?? "",
        conta_id: "",
        documento: n.numero,
        descricao: n.descricao,
        observacoes: [n.forma_pagamento && `Pagamento: ${n.forma_pagamento}`, n.observacoes].filter(Boolean).join(" · "),
        liquido: br(n.valor_liquido || n.valor_total),
        forma: "avista",
        primeiro: "",
        quantas: "2",
        ...Object.fromEntries(RETENCOES.map(([c, k]) => [c, n.retencoes[k] ? br(n.retencoes[k]) : ""])),
      });
      const temDuplicatas = n.duplicatas.length > 0;
      setSemVencimento(!temDuplicatas);
      setParcelas(temDuplicatas ? n.duplicatas.map((p) => ({ vencimento: p.vencimento, valor: br(p.valor) })) : []);
    } catch (e) {
      setM({ erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setLendo(false);
    }
  }

  // Sem vencimento na nota: monta as parcelas pela forma de pagamento informada.
  function gerarParcelas(dados: Record<string, string>) {
    const total = num(dados.liquido);
    if (!dados.primeiro || !total) return setParcelas([]);
    const n = dados.forma === "parcelado" ? Math.min(Math.max(Number(dados.quantas) || 1, 1), 60) : 1;
    const cada = Math.floor((total / n) * 100) / 100;
    setParcelas(
      Array.from({ length: n }, (_, i) => ({
        vencimento: util(somarMeses(dados.primeiro, i)),
        valor: br(i === n - 1 ? Math.round((total - cada * (n - 1)) * 100) / 100 : cada),
      }))
    );
  }
  const mudar = (campo: string, v: string) => {
    const novo = { ...d, [campo]: v };
    setD(novo);
    if (semVencimento && ["forma", "primeiro", "quantas", "liquido"].includes(campo)) gerarParcelas(novo);
  };

  function lancar() {
    if (!leitura || !arquivo) return;
    iniciar(async () => {
      setM(null);
      // O PDF fica guardado na pasta da academia e anexado ao título.
      let anexo: string | null = null;
      if (d.academia_id) {
        const caminho = `${d.academia_id}/nf/${Date.now()}-${leitura.nota.numero.replace(/\W/g, "") || "nota"}.pdf`;
        const { error } = await createClient().storage.from("pagamentos").upload(caminho, arquivo, { contentType: "application/pdf" });
        if (!error) anexo = caminho;
      }
      const n = leitura.nota;
      const r = await lancarNotaFiscal({
        academiaId: d.academia_id,
        fornecedorId: leitura.fornecedor?.id ?? null,
        novoFornecedor: leitura.fornecedor
          ? null
          : {
              documento: n.emitente.documento,
              razao_social: leitura.receita?.razao_social ?? n.emitente.razao_social,
              nome_fantasia: leitura.receita?.nome_fantasia ?? n.emitente.nome_fantasia,
              regime_tributario: leitura.receita?.regime ?? null,
              cnae: leitura.receita?.cnae ?? null,
              cidade: leitura.receita?.municipio.split("/")[0] ?? n.emitente.municipio,
              uf: leitura.receita?.municipio.split("/")[1] ?? n.emitente.uf,
            },
        categoriaId: d.categoria_id,
        contaId: d.conta_id,
        documento: d.documento,
        descricao: d.descricao,
        observacoes: d.observacoes,
        retencoes: Object.fromEntries(RETENCOES.map(([c]) => [c, d[c] ?? ""])) as Record<(typeof RETENCOES)[number][0], string>,
        parcelas: parcelas.map((p) => ({ vencimento: util(p.vencimento), valor: p.valor })),
        anexo,
      });
      setM(r);
      if (r.ok) {
        setLeitura(null);
        setArquivo(null);
        if (campoArquivo.current) campoArquivo.current.value = "";
      }
    });
  }

  const soma = parcelas.reduce((t, p) => t + num(p.valor), 0);
  const liquido = num(d.liquido);
  const n = leitura?.nota;
  const tomadorErrado = leitura && !leitura.academia;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={campoArquivo}
            type="file"
            accept="application/pdf,.pdf"
            disabled={lendo || gravando}
            onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])}
            className="block text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-marca file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-marca-escuro"
          />
          {lendo && <span className="animate-pulse text-sm text-slate-500">Lendo a nota…</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">PDF da NF-e ou NFS-e (até 4 MB). O sistema lê os dados, você confere e lança no contas a pagar.</p>
      </div>
      <Mensagem m={m} />
      {m?.ok && (
        <p className="text-sm">
          <Link href="/financeiro/pagar" className="text-marca underline">
            Ver no contas a pagar
          </Link>
        </p>
      )}

      {leitura && n && (
        <div className="space-y-5 rounded-lg border border-marca/30 bg-white p-5">
          {leitura.repetidas.length > 0 && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              Atenção: a NF {n.numero} deste fornecedor já foi lançada ({leitura.repetidas.map((r) => `venc. ${dataBr(r.vencimento)} ${reais(Number(r.valor))}`).join("; ")}). Confira antes de lançar de novo.
            </p>
          )}
          {tomadorErrado && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              O tomador da nota ({n.tomador.razao_social ?? "?"} {n.tomador.documento ? formatarDocumento(n.tomador.documento) : ""}) não é o CNPJ de nenhuma academia. A nota deve estar no CNPJ da academia que paga. Escolha a
              academia abaixo só se for o caso.
            </p>
          )}

          <section className="grid gap-3 md:grid-cols-12">
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm md:col-span-6">
              <p className="text-xs text-slate-500">Fornecedor</p>
              <p className="font-semibold text-slate-900">{leitura.fornecedor ? leitura.fornecedor.nome_fantasia || leitura.fornecedor.razao_social : (leitura.receita?.razao_social ?? n.emitente.razao_social)}</p>
              <p className="text-xs text-slate-600">
                {formatarDocumento(n.emitente.documento)}
                {leitura.fornecedor ? " · já cadastrado" : " · fornecedor novo: será cadastrado ao lançar"}
                {leitura.receita && ` · Receita: ${leitura.receita.situacao}${leitura.receita.regime ? ` · ${leitura.receita.regime}` : ""}`}
              </p>
              {leitura.receita && leitura.receita.situacao !== "ATIVA" && <p className="text-xs font-medium text-red-700">Situação cadastral na Receita: {leitura.receita.situacao}.</p>}
            </div>
            <Escolha rotulo="Academia (tomador)" valor={d.academia_id ?? ""} mudar={(v) => mudar("academia_id", v)} opcoes={academias} className="md:col-span-3" />
            <Texto rotulo="Nota fiscal" valor={d.documento ?? ""} mudar={(v) => mudar("documento", v)} className="md:col-span-3" />
            <div className="md:col-span-6">
              <Escolha rotulo={leitura.fornecedor ? "Categoria" : "Categoria (fica como padrão deste fornecedor)"} valor={d.categoria_id ?? ""} mudar={(v) => mudar("categoria_id", v)} opcoes={categorias} />
              {!leitura.fornecedor && !d.categoria_id && <p className="mt-1 text-xs text-amber-700">Fornecedor novo: escolha a categoria. Nos próximos lançamentos dele ela já vem preenchida.</p>}
            </div>
            <Escolha
              rotulo="Conta corrente"
              valor={d.conta_id ?? ""}
              mudar={(v) => mudar("conta_id", v)}
              opcoes={contas.filter((c) => c.academia_id === d.academia_id).map((c) => ({ valor: c.id, rotulo: c.nome }))}
              vazio="—"
              className="md:col-span-3"
            />
            <Rotulo texto="Emissão" className="md:col-span-3">
              <p className={`${CAMPO} bg-slate-50`}>{n.data_emissao ? dataBr(n.data_emissao) : "—"}</p>
            </Rotulo>
            <Texto rotulo="Descrição" valor={d.descricao ?? ""} mudar={(v) => mudar("descricao", v)} className="md:col-span-12" />
          </section>

          <section className="grid gap-3 md:grid-cols-12">
            <Rotulo texto="Valor total da nota" className="md:col-span-3">
              <p className={`${CAMPO} bg-slate-50 text-right tabular-nums`}>{reais(n.valor_total)}</p>
            </Rotulo>
            {RETENCOES.map(([c, , r]) => (
              <CampoMoeda key={c} rotulo={`${r} retido`} valor={d[c] ?? ""} mudar={(v) => mudar(c, v)} className="md:col-span-1 min-w-28" />
            ))}
            <CampoMoeda rotulo="Valor líquido a pagar" valor={d.liquido ?? ""} mudar={(v) => mudar("liquido", formatarMoeda(v))} className="md:col-span-3" />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Pagamento</h3>
            {semVencimento ? (
              <div className="space-y-2">
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  A nota não informa vencimento{n.forma_pagamento ? ` (diz: "${n.forma_pagamento}")` : ""}. Informe a data de pagamento e a forma.
                </p>
                <div className="grid gap-3 md:grid-cols-12">
                  <Escolha rotulo="Forma" valor={d.forma ?? "avista"} mudar={(v) => mudar("forma", v)} opcoes={[{ valor: "avista", rotulo: "À vista" }, { valor: "parcelado", rotulo: "Parcelado (mensal)" }]} vazio="—" className="md:col-span-3" />
                  <Texto rotulo={d.forma === "parcelado" ? "Vencimento da 1ª parcela" : "Data de pagamento"} tipo="date" valor={d.primeiro ?? ""} mudar={(v) => mudar("primeiro", v)} className="md:col-span-3" />
                  {d.forma === "parcelado" && (
                    <Rotulo texto="Nº de parcelas" className="md:col-span-2">
                      <input type="number" min={2} max={60} value={d.quantas ?? "2"} onChange={(e) => mudar("quantas", e.target.value)} className={CAMPO} />
                    </Rotulo>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Vencimentos lidos da nota. Pode alterar abaixo.</p>
            )}
            {parcelas.length > 0 && (
              <table className="text-sm">
                <thead className="text-left text-xs text-slate-600">
                  <tr>
                    <th className="pr-3">Parcela</th>
                    <th className="pr-3">Vencimento</th>
                    <th className="pr-3">Valor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map((p, i) => {
                    const ajustado = util(p.vencimento);
                    return (
                      <tr key={i}>
                        <td className="pr-3 tabular-nums text-slate-600">
                          {i + 1}/{parcelas.length}
                        </td>
                        <td className="py-1 pr-3">
                          <input type="date" value={p.vencimento} onChange={(e) => setParcelas(parcelas.map((x, j) => (j === i ? { ...x, vencimento: util(e.target.value) } : x)))} className={CAMPO} />
                          {ajustado !== p.vencimento && <span className="block text-xs text-amber-700">vai para {dataBr(ajustado)} (dia útil)</span>}
                        </td>
                        <td className="py-1 pr-3">
                          <CampoMoeda valor={p.valor} mudar={(v) => setParcelas(parcelas.map((x, j) => (j === i ? { ...x, valor: v } : x)))} className="w-40" />
                        </td>
                        <td>
                          {parcelas.length > 1 && (
                            <button type="button" onClick={() => setParcelas(parcelas.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">
                              tirar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!semVencimento && (
              <button type="button" onClick={() => setParcelas([...parcelas, { vencimento: hojeIso(), valor: "" }])} className="text-sm text-marca hover:underline">
                + parcela
              </button>
            )}
            {parcelas.length > 0 && Math.abs(soma - liquido) > 0.009 && (
              <p className="text-sm text-amber-800">
                A soma das parcelas ({reais(soma)}) é diferente do valor líquido ({reais(liquido)}).
              </p>
            )}
          </section>

          <Texto rotulo="Observações" valor={d.observacoes ?? ""} mudar={(v) => mudar("observacoes", v)} />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setLeitura(null)} className={BOTAO_SECUNDARIO}>
              Descartar
            </button>
            <button type="button" onClick={lancar} disabled={gravando || !d.academia_id || !d.categoria_id || !parcelas.length} className={BOTAO_PRIMARIO}>
              {gravando ? "Lançando…" : `Lançar no contas a pagar${parcelas.length > 1 ? ` (${parcelas.length} parcelas)` : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
