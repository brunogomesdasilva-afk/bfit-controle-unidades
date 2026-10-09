"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { dataBr, FORMAS, reais } from "@/lib/financeiro";
import { baixarTitulos, conciliar, excluirLancamento, importarOfx, salvarLancamento, transferir } from "../acoes";
import { BuscaPessoa, type PessoaResumo } from "../BuscaPessoa";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CampoMoeda, Escolha, Janela, Mensagem, Texto } from "../componentes";

// Extrato de uma conta no período, com o saldo dia a dia: conciliar o que bateu com o banco, lançar tarifas e
// outros lançamentos avulsos, transferir entre contas, importar o extrato do banco (OFX) e baixar um título com
// uma linha que veio do banco.

export type LinhaExtrato = {
  id: string;
  data: string;
  valor: number;
  descricao: string | null;
  pessoa: string;
  pessoa_id: string | null;
  categoria: string;
  categoria_id: string | null;
  origem: "manual" | "baixa" | "transferencia" | "extrato";
  conciliado: boolean;
  titulos: string[]; // títulos baixados com este lançamento
};
export type TituloAberto = { id: string; tipo: "pagar" | "receber"; nome: string; vencimento: string; saldo: number; documento: string | null };
type Opcao = { valor: string; rotulo: string; grupo?: string };

const ORIGEM: Record<LinhaExtrato["origem"], string> = { manual: "Lançamento", baixa: "Baixa de título", transferencia: "Transferência", extrato: "Do banco" };
const hojeIso = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export function Extrato({
  contaId,
  contas,
  linhas,
  saldoAnterior,
  pessoas,
  categorias,
  abertos,
}: {
  contaId: string;
  contas: Opcao[];
  linhas: LinhaExtrato[];
  saldoAnterior: number;
  pessoas: PessoaResumo[];
  categorias: Opcao[];
  abertos: TituloAberto[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [lancamento, setLancamento] = useState<Record<string, string> | null>(null);
  const [transferencia, setTransferencia] = useState<Record<string, string> | null>(null);
  const [baixarCom, setBaixarCom] = useState<LinhaExtrato | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "banco">("todos");
  const [ocupado, iniciar] = useTransition();
  const arquivo = useRef<HTMLInputElement | null>(null);

  const comSaldo = useMemo(
    () =>
      linhas.reduce<(LinhaExtrato & { saldo: number })[]>((lista, l) => {
        const anterior = lista.length ? lista[lista.length - 1].saldo : saldoAnterior;
        return [...lista, { ...l, saldo: anterior + l.valor }];
      }, []),
    [linhas, saldoAnterior]
  );
  const visiveis = comSaldo.filter((l) => filtro === "todos" || (filtro === "pendentes" ? !l.conciliado : l.origem === "extrato" && !l.categoria_id && !l.titulos.length));
  const entradas = linhas.filter((l) => l.valor > 0).reduce((t, l) => t + l.valor, 0);
  const saidas = linhas.filter((l) => l.valor < 0).reduce((t, l) => t + l.valor, 0);
  const pendentes = linhas.filter((l) => !l.conciliado).length;
  const semClassificar = linhas.filter((l) => l.origem === "extrato" && !l.categoria_id && !l.titulos.length).length;

  const acao = (f: () => Promise<{ erro?: string; ok?: string }>) =>
    iniciar(async () => {
      const r = await f();
      setM(r);
      if (r.ok) setSel(new Set());
    });
  const importar = (f: File | undefined) => {
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => acao(() => importarOfx(contaId, String(leitor.result ?? "")));
    leitor.readAsText(f, "latin1");
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Saldo anterior", saldoAnterior],
          ["Entradas", entradas],
          ["Saídas", saidas],
          ["Saldo no fim do período", saldoAnterior + entradas + saidas],
        ].map(([r, v]) => (
          <div key={r as string} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{r}</p>
            <p className={`text-lg font-semibold tabular-nums ${(v as number) < 0 ? "text-red-700" : "text-slate-900"}`}>{reais(v as number)}</p>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Pendências</p>
          <p className="text-sm">
            <strong>{pendentes}</strong> não conciliado(s)
            <br />
            <strong>{semClassificar}</strong> do banco sem classificar
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "pendentes", "banco"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-sm ${filtro === f ? "bg-marca text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {{ todos: "Todos", pendentes: "Não conciliados", banco: "Do banco sem classificar" }[f]}
          </button>
        ))}
        {sel.size > 0 && (
          <>
            <button type="button" disabled={ocupado} onClick={() => acao(() => conciliar([...sel], true))} className={BOTAO_PRIMARIO}>
              Conciliar {sel.size}
            </button>
            <button type="button" disabled={ocupado} onClick={() => acao(() => conciliar([...sel], false))} className={BOTAO_SECUNDARIO}>
              Desfazer conciliação
            </button>
          </>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => setLancamento({ conta_id: contaId, data: hojeIso(), sentido: "saida" })} className={BOTAO_SECUNDARIO}>
            + Lançamento
          </button>
          <button type="button" onClick={() => setTransferencia({ origem: contaId, data: hojeIso() })} className={BOTAO_SECUNDARIO}>
            + Transferência
          </button>
          <button type="button" onClick={() => arquivo.current?.click()} disabled={ocupado} className={BOTAO_PRIMARIO}>
            Importar extrato (OFX)
          </button>
          <input ref={arquivo} type="file" accept=".ofx,.OFX" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
        </span>
      </div>
      <Mensagem m={m} />

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="w-8 px-3 py-2">
                <input type="checkbox" aria-label="Selecionar todos" checked={visiveis.length > 0 && visiveis.every((l) => sel.has(l.id))} onChange={(e) => setSel(e.target.checked ? new Set(visiveis.map((l) => l.id)) : new Set())} />
              </th>
              <th className="px-2 py-2">Situação</th>
              <th className="px-2 py-2">Data</th>
              <th className="px-2 py-2">Cliente / fornecedor · descrição</th>
              <th className="px-2 py-2">Categoria</th>
              <th className="px-2 py-2">Origem</th>
              <th className="px-2 py-2 text-right">Valor</th>
              <th className="px-2 py-2 text-right">Saldo</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l, i) => {
              const fimDoDia = i === visiveis.length - 1 || visiveis[i + 1].data !== l.data;
              return (
                <tr key={l.id} className={`border-t border-slate-100 ${fimDoDia ? "border-b border-b-slate-200" : ""} ${sel.has(l.id) ? "bg-sky-50" : ""}`}>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" aria-label="Selecionar" checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
                  </td>
                  <td className="px-2">
                    {l.conciliado ? (
                      <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">✓ Conciliado</span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Pendente</span>
                    )}
                  </td>
                  <td className="px-2 tabular-nums">{dataBr(l.data)}</td>
                  <td className="max-w-96 px-2">
                    <span className="block truncate font-medium text-slate-900">{l.pessoa || l.descricao || "—"}</span>
                    {(l.pessoa && l.descricao) || l.titulos.length ? <span className="block truncate text-xs text-slate-500">{[l.pessoa ? l.descricao : null, ...l.titulos].filter(Boolean).join(" · ")}</span> : null}
                  </td>
                  <td className="max-w-56 truncate px-2 text-slate-600">{l.categoria || (l.origem === "extrato" && !l.titulos.length ? <span className="text-amber-700">sem classificar</span> : "")}</td>
                  <td className="px-2 text-xs text-slate-500">{ORIGEM[l.origem]}</td>
                  <td className={`px-2 text-right font-medium tabular-nums ${l.valor < 0 ? "text-red-700" : "text-sky-700"}`}>{reais(l.valor)}</td>
                  <td className={`px-2 text-right tabular-nums ${fimDoDia ? "font-semibold" : "text-slate-400"}`}>{reais(l.saldo)}</td>
                  <td className="whitespace-nowrap px-2 text-right text-xs">
                    {l.origem === "extrato" && !l.titulos.length && (
                      <button type="button" onClick={() => setBaixarCom(l)} className="mr-2 text-marca hover:underline">
                        Baixar título
                      </button>
                    )}
                    {(l.origem === "manual" || (l.origem === "extrato" && !l.titulos.length)) && (
                      <button
                        type="button"
                        onClick={() =>
                          setLancamento({ id: l.id, conta_id: contaId, data: l.data, valor: Math.abs(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), sentido: l.valor < 0 ? "saida" : "entrada", descricao: l.descricao ?? "", pessoa_id: l.pessoa_id ?? "", categoria_id: l.categoria_id ?? "" })
                        }
                        className="mr-2 text-slate-600 hover:underline"
                      >
                        {l.origem === "extrato" && !l.categoria_id ? "Classificar" : "Alterar"}
                      </button>
                    )}
                    {l.origem !== "baixa" && (
                      <button type="button" onClick={() => window.confirm("Excluir este lançamento?") && acao(() => excluirLancamento(l.id))} className="text-red-700 hover:underline">
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  Nenhum lançamento no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lancamento && (
        <Janela titulo={lancamento.id ? "Alterar lançamento" : "Novo lançamento"} fechar={() => setLancamento(null)}>
          <div className="grid gap-3 md:grid-cols-4">
            <Escolha rotulo="Tipo" valor={lancamento.sentido} mudar={(v) => setLancamento({ ...lancamento, sentido: v })} opcoes={[{ valor: "saida", rotulo: "Saída" }, { valor: "entrada", rotulo: "Entrada" }]} vazio="—" />
            <Texto rotulo="Data" tipo="date" valor={lancamento.data ?? ""} mudar={(v) => setLancamento({ ...lancamento, data: v })} />
            <CampoMoeda rotulo="Valor" valor={lancamento.valor ?? ""} mudar={(v) => setLancamento({ ...lancamento, valor: v })} />
            <Escolha rotulo="Categoria" valor={lancamento.categoria_id ?? ""} mudar={(v) => setLancamento({ ...lancamento, categoria_id: v })} opcoes={categorias} vazio="—" />
            <div className="md:col-span-2">
              <BuscaPessoa rotulo="Cliente / fornecedor (opcional)" pessoas={pessoas} valor={lancamento.pessoa_id ?? ""} mudar={(id) => setLancamento({ ...lancamento, pessoa_id: id })} />
            </div>
            <Texto rotulo="Descrição" valor={lancamento.descricao ?? ""} mudar={(v) => setLancamento({ ...lancamento, descricao: v })} className="md:col-span-2" />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={ocupado} onClick={() => acao(async () => { const r = await salvarLancamento(lancamento); if (r.ok) setLancamento(null); return r; })} className={BOTAO_PRIMARIO}>
              Salvar
            </button>
          </div>
        </Janela>
      )}

      {transferencia && (
        <Janela titulo="Transferência entre contas" fechar={() => setTransferencia(null)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Escolha rotulo="Da conta" valor={transferencia.origem ?? ""} mudar={(v) => setTransferencia({ ...transferencia, origem: v })} opcoes={contas} />
            <Escolha rotulo="Para a conta" valor={transferencia.destino ?? ""} mudar={(v) => setTransferencia({ ...transferencia, destino: v })} opcoes={contas} />
            <Texto rotulo="Data" tipo="date" valor={transferencia.data ?? ""} mudar={(v) => setTransferencia({ ...transferencia, data: v })} />
            <CampoMoeda rotulo="Valor" valor={transferencia.valor ?? ""} mudar={(v) => setTransferencia({ ...transferencia, valor: v })} />
            <Texto rotulo="Descrição" valor={transferencia.descricao ?? ""} mudar={(v) => setTransferencia({ ...transferencia, descricao: v })} className="md:col-span-2" />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={ocupado} onClick={() => acao(async () => { const r = await transferir(transferencia); if (r.ok) setTransferencia(null); return r; })} className={BOTAO_PRIMARIO}>
              Transferir
            </button>
          </div>
        </Janela>
      )}

      {baixarCom && <BaixarComLinha linha={baixarCom} contaId={contaId} abertos={abertos} fechar={() => setBaixarCom(null)} />}
    </div>
  );
}

// Baixa um título usando uma linha que veio do banco (sem lançar de novo no extrato).
function BaixarComLinha({ linha, contaId, abertos, fechar }: { linha: LinhaExtrato; contaId: string; abertos: TituloAberto[]; fechar: () => void }) {
  const tipo = linha.valor < 0 ? "pagar" : "receber";
  const valor = Math.abs(linha.valor);
  const [busca, setBusca] = useState("");
  const [forma, setForma] = useState("PIX");
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const lista = abertos
    .filter((t) => t.tipo === tipo && (!busca || `${t.nome} ${t.documento ?? ""}`.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => Math.abs(a.saldo - valor) - Math.abs(b.saldo - valor) || a.vencimento.localeCompare(b.vencimento))
    .slice(0, 40);
  const escolher = (t: TituloAberto) =>
    iniciar(async () => {
      const v = Math.min(valor, t.saldo);
      const juros = valor > t.saldo ? valor - t.saldo : 0;
      const r = await baixarTitulos(
        [{ tituloId: t.id, valor: v.toFixed(2).replace(".", ","), juros: juros ? juros.toFixed(2).replace(".", ",") : "" }],
        { data: linha.data, contaId, forma, movimentoId: linha.id, observacoes: "Baixa pela conciliação" }
      );
      setM(r);
      if (r.ok) setTimeout(fechar, 500);
    });
  return (
    <Janela titulo={`Baixar título com o lançamento de ${dataBr(linha.data)} (${reais(linha.valor)})`} fechar={fechar}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou NF" className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={forma} onChange={(e) => setForma(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-sm" aria-label="Forma">
            {FORMAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          Títulos {tipo === "pagar" ? "a pagar" : "a receber"} em aberto desta academia, os de saldo mais perto de {reais(valor)} primeiro. Se o lançamento for
          menor que o saldo, a baixa é parcial; se for maior, a diferença entra como juros.
        </p>
        <ul className="max-h-96 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">
          {lista.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{t.nome}</span>
                <span className="block text-xs text-slate-500">
                  Venc. {dataBr(t.vencimento)}
                  {t.documento ? ` · NF ${t.documento}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">{reais(t.saldo)}</span>
                <button type="button" disabled={ocupado} onClick={() => escolher(t)} className={BOTAO_PRIMARIO}>
                  Baixar
                </button>
              </span>
            </li>
          ))}
          {lista.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">Nenhum título em aberto.</li>}
        </ul>
        <Mensagem m={m} />
      </div>
    </Janela>
  );
}
