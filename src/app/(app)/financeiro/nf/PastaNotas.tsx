"use client";

import { useEffect, useState } from "react";
import { reais } from "@/lib/financeiro";
import type { ResultadoNavegador } from "@/lib/nfDrive";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Escolha, Texto } from "../componentes";

// Importar NF > "Importar uma pasta": o navegador (Chrome ou Edge) abre a pasta das notas do computador e manda cada
// PDF para o robô das notas. Lançada: o PDF vai para a pasta da contabilidade, em ano / mês / academia, com o nome
// novo. Duplicada (já no contas a pagar): não importa e fica na pasta. Sem categoria ou vencimento: a tela pede e
// lança. As duas pastas escolhidas ficam lembradas neste navegador (os caminhos de referência são os do
// Administrador > Notas do Drive).

type Opcao = { valor: string; rotulo: string; grupo?: string };
type Pasta = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemHandle>;
  queryPermission: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission: (o: { mode: "readwrite" }) => Promise<PermissionState>;
};
type Linha = ResultadoNavegador & { arquivoObj?: File; categoriaId?: string; vencimento?: string; enviando?: boolean };

// Guarda as pastas escolhidas no navegador (IndexedDB aceita o "endereço" da pasta; localStorage não).
const BANCO = "bfit-notas";
function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pastas");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}
async function lerPasta(chave: string): Promise<Pasta | null> {
  try {
    const db = await abrirBanco();
    return await new Promise((ok) => {
      const r = db.transaction("pastas").objectStore("pastas").get(chave);
      r.onsuccess = () => ok((r.result as Pasta) ?? null);
      r.onerror = () => ok(null);
    });
  } catch {
    return null;
  }
}
async function gravarPasta(chave: string, pasta: Pasta) {
  try {
    const db = await abrirBanco();
    db.transaction("pastas", "readwrite").objectStore("pastas").put(pasta, chave);
  } catch {
    // Sem armazenamento: escolhe a pasta de novo na próxima vez.
  }
}

async function permitir(p: Pasta) {
  if ((await p.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await p.requestPermission({ mode: "readwrite" })) === "granted";
}

// Move o PDF para <contabilidade>/<pastas...>/<nome> (se o nome já existe, acrescenta (2), (3)...).
async function mover(origem: Pasta, destino: Pasta, arquivo: File, pastas: string[], nome: string) {
  let dir: FileSystemDirectoryHandle = destino;
  for (const p of pastas) dir = await dir.getDirectoryHandle(p, { create: true });
  let final = nome;
  for (let i = 2; await dir.getFileHandle(final).then(() => true, () => false); i++) final = nome.replace(/\.pdf$/i, ` (${i}).pdf`);
  const novo = await dir.getFileHandle(final, { create: true });
  const w = await novo.createWritable();
  await w.write(arquivo);
  await w.close();
  await origem.removeEntry(arquivo.name);
  return [...pastas, final].join(" / ");
}

const COR: Record<string, string> = {
  lancada: "bg-emerald-50 text-emerald-800",
  ja_lancada: "bg-red-50 text-red-800",
  pendente: "bg-amber-50 text-amber-900",
  erro: "bg-red-50 text-red-800",
};
const ROTULO: Record<string, string> = { lancada: "Lançada", ja_lancada: "Duplicada", pendente: "Pendente", erro: "Erro" };

export function PastaNotas({ categorias, caminhos }: { categorias: Opcao[]; caminhos: { notas: string | null; contabilidade: string | null } }) {
  const [suportado, setSuportado] = useState(true);
  const [notas, setNotas] = useState<Pasta | null>(null);
  const [contab, setContab] = useState<Pasta | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!("showDirectoryPicker" in window)) {
      Promise.resolve().then(() => setSuportado(false));
      return;
    }
    lerPasta("notas").then(setNotas);
    lerPasta("contabilidade").then(setContab);
  }, []);

  const escolher = async (chave: "notas" | "contabilidade") => {
    try {
      const p = (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Pasta> }).showDirectoryPicker({ id: `bfit-${chave}`, mode: "readwrite" })) as Pasta;
      await gravarPasta(chave, p);
      if (chave === "notas") setNotas(p);
      else setContab(p);
    } catch {
      // Cancelou a escolha.
    }
  };

  const enviar = async (arquivo: File, extra: { categoriaId?: string; vencimento?: string } = {}): Promise<ResultadoNavegador> => {
    const corpo = new FormData();
    corpo.set("arquivo", arquivo);
    corpo.set("modificado", new Date(arquivo.lastModified).toISOString());
    if (extra.categoriaId) corpo.set("categoriaId", extra.categoriaId);
    if (extra.vencimento) corpo.set("vencimento", extra.vencimento);
    const r = await fetch("/financeiro/nf/pasta", { method: "POST", body: corpo });
    const j = await r.json().catch(() => ({ erro: `Erro ${r.status} no servidor.` }));
    if (!r.ok) return { arquivo: arquivo.name, situacao: "erro", motivo: j.erro ?? `Erro ${r.status}.` };
    return j as ResultadoNavegador;
  };

  // Lançou: move o PDF para a contabilidade e mostra para onde foi.
  const concluir = async (r: ResultadoNavegador, arquivo: File): Promise<Linha> => {
    if (r.situacao === "lancada" && r.pastas && r.nomeNovo && notas && contab) {
      try {
        return { ...r, destino: await mover(notas, contab, arquivo, r.pastas, r.nomeNovo) };
      } catch (e) {
        return { ...r, motivo: `Lançada, mas não foi possível mover o PDF: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return { ...r, arquivoObj: arquivo };
  };

  const rodar = async () => {
    if (!notas || !contab) return;
    setErro(null);
    if (!(await permitir(notas)) || !(await permitir(contab))) return setErro("O navegador não deu acesso às pastas. Clique em Rodar agora e permita.");
    const pdfs: File[] = [];
    for await (const h of notas.values()) if (h.kind === "file" && /\.pdf$/i.test(h.name)) pdfs.push(await (h as FileSystemFileHandle).getFile());
    if (!pdfs.length) return setErro("Nenhum PDF na pasta das notas.");
    setLinhas([]);
    const feitas: Linha[] = [];
    for (const [i, f] of pdfs.entries()) {
      setRodando(`Lendo ${i + 1} de ${pdfs.length}: ${f.name}`);
      feitas.push(await concluir(await enviar(f), f));
      setLinhas([...feitas]);
    }
    setRodando(null);
  };

  const mudarLinha = (i: number, campo: "categoriaId" | "vencimento", v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
  const lancarPendente = async (i: number) => {
    const l = linhas[i];
    if (!l.arquivoObj) return;
    setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, enviando: true } : x)));
    const r = await concluir(await enviar(l.arquivoObj, { categoriaId: l.categoriaId, vencimento: l.vencimento }), l.arquivoObj);
    setLinhas((ls) => ls.map((x, j) => (j === i ? r : x)));
  };

  const conta = (s: string) => linhas.filter((l) => l.situacao === s).length;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Importar uma pasta inteira</h2>
        <p className="text-xs text-slate-500">
          Lança todas as notas da pasta. A nota lançada vai para a pasta da contabilidade (ano / mês / academia, com o nome &quot;NF número - fornecedor - R$
          valor - venc data&quot;). A <strong>duplicada</strong> (já no contas a pagar) não é importada e fica na pasta. Se faltar categoria ou vencimento, a
          tela pede aqui embaixo.
        </p>
      </div>
      {!suportado ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Para importar uma pasta, abra o sistema no Google Chrome ou no Microsoft Edge.</p>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {(
              [
                ["notas", "Pasta das notas fiscais", notas, caminhos.notas],
                ["contabilidade", "Pasta da contabilidade (destino)", contab, caminhos.contabilidade],
              ] as const
            ).map(([chave, rotulo, pasta, caminho]) => (
              <div key={chave} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs text-slate-500">{rotulo}</p>
                <p className="font-medium text-slate-900">{pasta ? `📁 ${pasta.name}` : "não escolhida"}</p>
                {caminho && <p className="truncate text-xs text-slate-500" title={caminho}>Cadastrada no Administrador: {caminho}</p>}
                <button type="button" onClick={() => escolher(chave)} disabled={Boolean(rodando)} className="mt-1 text-xs text-marca hover:underline">
                  {pasta ? "Trocar pasta" : "Escolher pasta"}
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={rodar} disabled={!notas || !contab || Boolean(rodando)} className={BOTAO_PRIMARIO}>
              {rodando ? "Rodando…" : "Rodar agora"}
            </button>
            {rodando && <span className="animate-pulse text-sm text-slate-500">{rodando}</span>}
            {!rodando && linhas.length > 0 && (
              <span className="text-sm text-slate-600">
                {conta("lancada")} lançada(s) · {conta("ja_lancada")} duplicada(s) · {conta("pendente")} pendente(s) · {conta("erro")} com erro
              </span>
            )}
          </div>
          {erro && <p className="text-sm text-red-700">{erro}</p>}
          {linhas.length > 0 && (
            <div className="sem-barra overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-600">
                  <tr>
                    <th className="py-1 pr-2">Arquivo</th>
                    <th className="px-2 py-1">Situação</th>
                    <th className="px-2 py-1">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={`${l.arquivo}-${i}`} className="border-t border-slate-100 align-top">
                      <td className="max-w-64 truncate py-1.5 pr-2" title={l.arquivo}>
                        {l.arquivo}
                        {l.fornecedor && (
                          <span className="block text-xs text-slate-500">
                            {l.fornecedor}
                            {l.numero ? ` · NF ${l.numero}` : ""}
                            {l.valor ? ` · ${reais(l.valor)}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR[l.situacao]}`}>{ROTULO[l.situacao]}</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-600">
                        {l.situacao === "lancada" ? `Movida para ${l.destino ?? ""}` : l.motivo}
                        {l.situacao === "pendente" && l.faltando?.length ? (
                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            {l.faltando.includes("categoria") && (
                              <Escolha rotulo="Categoria (fica no fornecedor)" valor={l.categoriaId ?? ""} mudar={(v) => mudarLinha(i, "categoriaId", v)} opcoes={categorias} className="w-72" />
                            )}
                            {l.faltando.includes("vencimento") && <Texto rotulo="Vencimento" tipo="date" valor={l.vencimento ?? ""} mudar={(v) => mudarLinha(i, "vencimento", v)} />}
                            <button
                              type="button"
                              onClick={() => lancarPendente(i)}
                              disabled={
                                l.enviando || (l.faltando.includes("categoria") && !l.categoriaId) || (l.faltando.includes("vencimento") && !l.vencimento)
                              }
                              className={BOTAO_SECUNDARIO}
                            >
                              {l.enviando ? "Lançando…" : "Lançar"}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
