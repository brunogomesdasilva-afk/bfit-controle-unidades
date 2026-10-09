"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { proximoDiaUtil } from "@/lib/diasUteis";
import { dataBr, FORMAS, nomePessoa, reais, SITUACOES, type Titulo, type TipoTitulo } from "@/lib/financeiro";
import { baixarTitulos, cancelarTitulo, estornarBaixa, historicoTitulo, linkDoAnexo, salvarTitulo, type BaixaPedida } from "../acoes";
import { BuscaPessoa, type PessoaResumo } from "../BuscaPessoa";
import { FormularioPessoa } from "../cadastros/pessoas/Pessoas";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CampoMoeda, Escolha, Janela, Mensagem, Rotulo, Texto } from "../componentes";

// Contas a pagar e a receber (mesma tela): lista com seleção e totais; janela do título (dados, baixas e
// histórico); janela de baixa, inclusive parcial e de vários títulos de uma vez.

type Opcao = { valor: string; rotulo: string; grupo?: string };
type ContaOpcao = { id: string; nome: string; academia_id: string };
type Historico = Awaited<ReturnType<typeof historicoTitulo>>;

const hojeIso = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const br = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Situacao({ t }: { t: Pick<Titulo, "situacao"> }) {
  const s = SITUACOES[t.situacao];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.rotulo}</span>;
}

// ------------------------------------------------------------------------------------------- Formulário do título
function FormularioTitulo({
  tipo,
  inicial,
  academias,
  pessoas,
  categorias,
  contas,
  aoSalvar,
  novoCadastro,
  feriados,
}: {
  tipo: TipoTitulo;
  inicial: Record<string, string>;
  academias: Opcao[];
  pessoas: PessoaResumo[];
  categorias: Opcao[];
  contas: ContaOpcao[];
  aoSalvar: () => void;
  novoCadastro: (aoSalvar: (id: string) => void) => void;
  feriados: { data: string; academia_id: string | null }[];
}) {
  const [d, setD] = useState(inicial);
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [retencoes, setRetencoes] = useState(["ret_iss", "ret_irrf", "ret_inss", "ret_pis", "ret_cofins", "ret_csll"].some((r) => Number((inicial[r] ?? "0").replace(",", "."))));
  const [ocupado, iniciar] = useTransition();
  const campo = (c: string) => ({ valor: d[c] ?? "", mudar: (v: string) => setD({ ...d, [c]: v }) });
  const novo = !d.id;
  // Vencimento que não é dia útil vai para o próximo dia útil (o servidor faz o mesmo ao salvar).
  const [ajuste, setAjuste] = useState<string | null>(null);
  const mudarVencimento = (v: string) => {
    if (!/^d{4}-d{2}-d{2}$/.test(v)) return setD({ ...d, vencimento: v });
    const doDia = new Set(feriados.filter((f) => !f.academia_id || f.academia_id === d.academia_id).map((f) => f.data));
    const util = proximoDiaUtil(v, doDia);
    setAjuste(util !== v ? `${dataBr(v)} não é dia útil: o vencimento foi para ${dataBr(util)}.` : null);
    setD({ ...d, vencimento: util, previsao: !d.previsao || d.previsao === d.vencimento ? util : d.previsao });
  };
  const salvar = () =>
    iniciar(async () => {
      const r = await salvarTitulo(tipo, d.id || null, d);
      setM(r);
      if (r.ok) aoSalvar();
    });

  return (
    <div className="space-y-4">
      {/* Na ordem do sistema que já usamos: fornecedor, vencimento e valor; embaixo, categoria, previsão e conta. */}
      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-6">
          <BuscaPessoa
            rotulo={tipo === "pagar" ? "Fornecedor / favorecido" : "Cliente"}
            pessoas={pessoas}
            valor={d.pessoa_id ?? ""}
            mudar={(id, p) => setD({ ...d, pessoa_id: id, categoria_id: d.categoria_id || p?.categoria_padrao_id || "" })}
            incluir={() => novoCadastro((id) => setD((x) => ({ ...x, pessoa_id: id })))}
          />
        </div>
        <div className="md:col-span-3">
          <Texto rotulo={novo && Number(d.parcelas) > 1 ? "Vencimento da 1ª parcela" : "Vencimento"} tipo="date" valor={d.vencimento ?? ""} mudar={mudarVencimento} />
          {ajuste && <p className="mt-1 text-xs text-amber-700">{ajuste}</p>}
        </div>
        <CampoMoeda rotulo={novo && Number(d.parcelas) > 1 ? "Valor total (dividido nas parcelas)" : "Valor da conta"} {...campo("valor")} className="md:col-span-3" />
        <Escolha rotulo="Categoria" {...campo("categoria_id")} opcoes={categorias} className="md:col-span-6" />
        <Texto rotulo="Previsão de pagamento" tipo="date" {...campo("previsao")} className="md:col-span-3" />
        <Escolha
          rotulo="Conta corrente"
          {...campo("conta_id")}
          opcoes={contas.filter((c) => !d.academia_id || c.academia_id === d.academia_id).map((c) => ({ valor: c.id, rotulo: c.nome }))}
          vazio="—"
          className="md:col-span-3"
        />
      </div>
      <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-12">
        <Texto rotulo="Nota fiscal" {...campo("documento")} className="md:col-span-3" />
        <Texto rotulo="Data de registro" tipo="date" {...campo("data_registro")} className="md:col-span-3" />
        <Escolha rotulo="Academia (projeto)" {...campo("academia_id")} opcoes={academias} className="md:col-span-3" />
        {novo && (
          <Rotulo texto="Parcelas (mensais)" className="md:col-span-3">
            <input type="number" min={1} max={120} value={d.parcelas ?? "1"} onChange={(e) => setD({ ...d, parcelas: e.target.value })} className={CAMPO} />
          </Rotulo>
        )}
        <Texto rotulo="Descrição" {...campo("descricao")} className="md:col-span-12" />
        <Texto rotulo="Observações" {...campo("observacoes")} className="md:col-span-12" />
      </div>
      <div>
        <button type="button" onClick={() => setRetencoes(!retencoes)} className="text-sm text-marca hover:underline">
          {retencoes ? "▾" : "▸"} Impostos retidos na nota
        </button>
        {retencoes && (
          <div className="mt-2 grid gap-3 md:grid-cols-6">
            {[
              ["ret_iss", "ISS"],
              ["ret_irrf", "IRRF"],
              ["ret_inss", "INSS"],
              ["ret_pis", "PIS"],
              ["ret_cofins", "COFINS"],
              ["ret_csll", "CSLL"],
            ].map(([c, r]) => (
              <CampoMoeda key={c} rotulo={r} {...campo(c)} />
            ))}
            <p className="text-xs text-slate-500 md:col-span-6">Informativo: o valor do título é o líquido a {tipo === "pagar" ? "pagar" : "receber"}, já sem as retenções.</p>
          </div>
        )}
      </div>
      <Mensagem m={m} />
      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={ocupado} className={BOTAO_PRIMARIO}>
          {ocupado ? "Salvando…" : novo ? "Incluir" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- Janela de baixa
function JanelaBaixa({ tipo, titulos, contas, nomeDe, fechar }: { tipo: TipoTitulo; titulos: Titulo[]; contas: ContaOpcao[]; nomeDe: (t: Titulo) => string; fechar: () => void }) {
  const academia = titulos[0]?.academia_id;
  const contasDaAcademia = contas.filter((c) => c.academia_id === academia);
  const [comum, setComum] = useState({ data: hojeIso(), contaId: titulos[0]?.conta_id ?? contasDaAcademia[0]?.id ?? "", forma: "PIX", observacoes: "" });
  const [linhas, setLinhas] = useState<Record<string, BaixaPedida>>(Object.fromEntries(titulos.map((t) => [t.id, { tituloId: t.id, valor: br(t.saldo), juros: "", multa: "", desconto: "" }])));
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const n = (s?: string) => Number((s ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const total = Object.values(linhas).reduce((t, l) => t + n(l.valor) + n(l.juros) + n(l.multa), 0);
  const variasAcademias = new Set(titulos.map((t) => t.academia_id)).size > 1;
  const alterar = (id: string, campo: keyof BaixaPedida, v: string) => setLinhas({ ...linhas, [id]: { ...linhas[id], [campo]: v } });
  const baixar = () =>
    iniciar(async () => {
      const r = await baixarTitulos(Object.values(linhas), comum);
      setM(r);
      if (r.ok) setTimeout(fechar, 600);
    });

  return (
    <Janela titulo={tipo === "pagar" ? "Registrar pagamento" : "Registrar recebimento"} fechar={fechar} largura="max-w-4xl">
      {variasAcademias ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Escolha títulos de uma academia só: a baixa sai de uma conta da academia.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Texto rotulo={tipo === "pagar" ? "Data do pagamento" : "Data do recebimento"} tipo="date" valor={comum.data} mudar={(v) => setComum({ ...comum, data: v })} />
            <Escolha rotulo="Conta" valor={comum.contaId} mudar={(v) => setComum({ ...comum, contaId: v })} opcoes={contasDaAcademia.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
            <Escolha rotulo="Forma" valor={comum.forma} mudar={(v) => setComum({ ...comum, forma: v })} opcoes={FORMAS.map((f) => ({ valor: f, rotulo: f }))} />
            <Texto rotulo="Observação" valor={comum.observacoes} mudar={(v) => setComum({ ...comum, observacoes: v })} />
          </div>
          {contasDaAcademia.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Cadastre uma conta bancária desta academia em Financeiro → Cadastros → Contas bancárias.</p>}
          <div className="overflow-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="text-left text-xs text-slate-600">
                <tr>
                  <th className="py-1 pr-2">Título</th>
                  <th className="px-2 py-1 text-right">Saldo</th>
                  <th className="px-2 py-1">Valor da baixa</th>
                  <th className="px-2 py-1">Juros</th>
                  <th className="px-2 py-1">Multa</th>
                  <th className="px-2 py-1">Desconto</th>
                </tr>
              </thead>
              <tbody>
                {titulos.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{nomeDe(t)}</span>
                      <span className="block text-xs text-slate-500">
                        Venc. {dataBr(t.vencimento)}
                        {t.parcelas > 1 ? ` · ${t.parcela}/${t.parcelas}` : ""}
                        {t.documento ? ` · NF ${t.documento}` : ""}
                      </span>
                    </td>
                    <td className="px-2 text-right tabular-nums">{reais(t.saldo)}</td>
                    {(["valor", "juros", "multa", "desconto"] as const).map((c) => (
                      <td key={c} className="px-2">
                        <CampoMoeda valor={linhas[t.id][c] ?? ""} mudar={(v) => alterar(t.id, c, v)} className="w-36" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Baixa menor que o saldo deixa o título em “baixa parcial”, com o restante em aberto. O desconto também abate o saldo; juros e multa só
            aumentam o valor {tipo === "pagar" ? "pago" : "recebido"}.
          </p>
          <Mensagem m={m} />
          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-slate-600">
              Total {tipo === "pagar" ? "pago" : "recebido"}: <strong className="tabular-nums">{reais(total)}</strong>
            </span>
            <button type="button" onClick={baixar} disabled={ocupado || !comum.contaId} className={BOTAO_PRIMARIO}>
              {ocupado ? "Registrando…" : "Confirmar baixa"}
            </button>
          </div>
        </div>
      )}
    </Janela>
  );
}

// ------------------------------------------------------------------------------------------- Janela do título
function JanelaTitulo({
  tipo,
  titulo,
  props,
  fechar,
  baixar,
}: {
  tipo: TipoTitulo;
  titulo: Titulo | null;
  props: Omit<Parameters<typeof FormularioTitulo>[0], "tipo" | "inicial" | "aoSalvar">;
  fechar: () => void;
  baixar: (t: Titulo) => void;
}) {
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  useEffect(() => {
    if (titulo) historicoTitulo(titulo.id).then(setHistorico);
  }, [titulo]);
  const inicial: Record<string, string> = titulo
    ? Object.fromEntries(
        Object.entries(titulo).map(([k, v]) => [k, typeof v === "number" && (k === "valor" || k.startsWith("ret_")) ? br(v) : v === null || v === undefined ? "" : String(v)])
      )
    : { parcelas: "1", vencimento: hojeIso(), data_registro: hojeIso(), academia_id: props.academias.length === 1 ? props.academias[0].valor : "" };
  const estornar = (id: string) => {
    if (!window.confirm("Estornar esta baixa? O valor volta para o saldo do título e o lançamento sai do extrato.")) return;
    iniciar(async () => {
      const r = await estornarBaixa(id);
      setM(r);
      if (r.ok && titulo) setHistorico(await historicoTitulo(titulo.id));
    });
  };
  const cancelar = (sim: boolean) => {
    if (!titulo || (sim && !window.confirm("Cancelar este título? Ele sai das contas em aberto (dá para reativar depois)."))) return;
    iniciar(async () => {
      const r = await cancelarTitulo(titulo.id, sim);
      setM(r);
      if (r.ok) setTimeout(fechar, 500);
    });
  };

  return (
    <Janela titulo={titulo ? `${tipo === "pagar" ? "Conta a pagar" : "Conta a receber"}${titulo.parcelas > 1 ? ` · parcela ${titulo.parcela}/${titulo.parcelas}` : ""}` : tipo === "pagar" ? "Incluir conta a pagar" : "Incluir conta a receber"} fechar={fechar} largura="max-w-5xl">
      <div className="space-y-5">
        {titulo && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <Situacao t={titulo} />
            <span>
              Total <strong className="tabular-nums">{reais(titulo.valor)}</strong>
            </span>
            <span>
              {tipo === "pagar" ? "Pago" : "Recebido"} <strong className="tabular-nums">{reais(titulo.pago)}</strong>
            </span>
            <span>
              Saldo <strong className="tabular-nums text-marca">{reais(titulo.saldo)}</strong>
            </span>
            <span className="ml-auto flex gap-2">
              {titulo.anexo && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await linkDoAnexo(titulo.anexo!);
                    if (r.url) window.open(r.url, "_blank");
                    else setM({ erro: r.erro });
                  }}
                  className={BOTAO_SECUNDARIO}
                >
                  Ver NF (PDF)
                </button>
              )}
              {titulo.saldo > 0 && !titulo.cancelado && (
                <button type="button" onClick={() => baixar(titulo)} className={BOTAO_PRIMARIO}>
                  {tipo === "pagar" ? "Registrar pagamento" : "Registrar recebimento"}
                </button>
              )}
              {titulo.cancelado ? (
                <button type="button" onClick={() => cancelar(false)} disabled={ocupado} className={BOTAO_SECUNDARIO}>
                  Reativar
                </button>
              ) : (
                titulo.baixado === 0 && (
                  <button type="button" onClick={() => cancelar(true)} disabled={ocupado} className={`${BOTAO_SECUNDARIO} text-red-700`}>
                    Cancelar título
                  </button>
                )
              )}
            </span>
          </div>
        )}
        <FormularioTitulo tipo={tipo} inicial={inicial} aoSalvar={() => setTimeout(fechar, 500)} {...props} />
        {titulo && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Histórico de baixas</h3>
            {!historico ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : historico.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma baixa ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-600">
                  <tr>
                    <th className="py-1">Data</th>
                    <th className="py-1">Conta / forma</th>
                    <th className="py-1 text-right">Valor</th>
                    <th className="py-1 text-right">Juros + multa</th>
                    <th className="py-1 text-right">Desconto</th>
                    <th className="py-1">Registrado por</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {historico.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-1.5">{dataBr(b.data)}</td>
                      <td>
                        {b.conta}
                        {b.forma ? ` · ${b.forma}` : ""}
                        {b.conciliado && <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">conciliado</span>}
                        {b.observacoes && <span className="block text-xs text-slate-500">{b.observacoes}</span>}
                      </td>
                      <td className="text-right tabular-nums">{reais(b.valor)}</td>
                      <td className="text-right tabular-nums">{b.juros + b.multa ? reais(b.juros + b.multa) : "–"}</td>
                      <td className="text-right tabular-nums">{b.desconto ? reais(b.desconto) : "–"}</td>
                      <td className="text-xs text-slate-500">
                        {b.autor} · {new Date(b.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="text-right">
                        <button type="button" onClick={() => estornar(b.id)} disabled={ocupado} className="text-xs text-red-700 hover:underline">
                          Estornar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        <Mensagem m={m} />
      </div>
    </Janela>
  );
}

// ------------------------------------------------------------------------------------------- Lista
export function Titulos({
  tipo,
  titulos,
  academias,
  pessoas,
  categorias,
  contas,
  categoriasCadastro,
  mostrarAcademia,
  feriados,
}: {
  tipo: TipoTitulo;
  titulos: Titulo[];
  academias: Opcao[];
  pessoas: PessoaResumo[];
  categorias: Opcao[];
  contas: ContaOpcao[];
  categoriasCadastro: Opcao[];
  mostrarAcademia: boolean;
  feriados: { data: string; academia_id: string | null }[];
}) {
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<Titulo | "novo" | null>(null);
  const [baixa, setBaixa] = useState<Titulo[] | null>(null);
  const [cadastro, setCadastro] = useState<((id: string) => void) | null>(null);
  const [listaPessoas, setListaPessoas] = useState(pessoas);
  const nome = useMemo(() => new Map(listaPessoas.map((p) => [p.id, nomePessoa(p)])), [listaPessoas]);
  const nomeCategoria = useMemo(() => new Map(categorias.map((c) => [c.valor, c.rotulo])), [categorias]);
  const nomeAcademia = useMemo(() => new Map(academias.map((a) => [a.valor, a.rotulo])), [academias]);
  const nomeDe = (t: Titulo) => (t.pessoa_id ? (nome.get(t.pessoa_id) ?? "") : "");

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return titulos;
    return titulos.filter((t) => `${nomeDe(t)} ${t.descricao ?? ""} ${t.documento ?? ""} ${nomeCategoria.get(t.categoria_id ?? "") ?? ""}`.toLowerCase().includes(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulos, busca, nome]);
  const base = selecionados.size ? lista.filter((t) => selecionados.has(t.id)) : lista;
  const soma = (c: "valor" | "pago" | "saldo") => base.reduce((s, t) => s + Number(t[c]), 0);
  const marcar = (id: string) => {
    const n = new Set(selecionados);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelecionados(n);
  };
  const baixaveis = lista.filter((t) => selecionados.has(t.id) && t.saldo > 0 && !t.cancelado);
  const propsForm = {
    feriados,
    academias,
    pessoas: listaPessoas,
    categorias,
    contas,
    novoCadastro: (aoSalvar: (id: string) => void) => setCadastro(() => aoSalvar),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, descrição, NF ou categoria" className="w-80 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        {baixaveis.length > 0 && (
          <button type="button" onClick={() => setBaixa(baixaveis)} className={BOTAO_PRIMARIO}>
            {tipo === "pagar" ? "Pagar" : "Receber"} {baixaveis.length} selecionado{baixaveis.length > 1 ? "s" : ""}
          </button>
        )}
        <button type="button" onClick={() => setAberto("novo")} className={`${BOTAO_PRIMARIO} ml-auto`}>
          + Incluir
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={lista.length > 0 && lista.every((t) => selecionados.has(t.id))}
                  onChange={(e) => setSelecionados(e.target.checked ? new Set(lista.map((t) => t.id)) : new Set())}
                />
              </th>
              <th className="px-2 py-2">Situação</th>
              <th className="px-2 py-2">Vencimento</th>
              <th className="px-2 py-2">Previsão</th>
              <th className="px-2 py-2">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</th>
              <th className="px-2 py-2">Descrição / NF</th>
              <th className="px-2 py-2">Parcela</th>
              <th className="px-2 py-2">Categoria</th>
              {mostrarAcademia && <th className="px-2 py-2">Academia</th>}
              <th className="px-2 py-2 text-right">Valor</th>
              <th className="px-2 py-2 text-right">{tipo === "pagar" ? "Pago" : "Recebido"}</th>
              <th className="px-2 py-2 text-right">Saldo</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id} className={`border-t border-slate-100 hover:bg-sky-50 ${selecionados.has(t.id) ? "bg-sky-50/60" : ""} ${t.cancelado ? "text-slate-400 line-through" : ""}`}>
                <td className="px-3 py-1.5">
                  <input type="checkbox" aria-label="Selecionar" checked={selecionados.has(t.id)} onChange={() => marcar(t.id)} />
                </td>
                <td className="cursor-pointer px-2" onClick={() => setAberto(t)}>
                  <Situacao t={t} />
                </td>
                <td className="cursor-pointer px-2 tabular-nums" onClick={() => setAberto(t)}>
                  {dataBr(t.vencimento)}
                </td>
                <td className="cursor-pointer px-2 tabular-nums text-slate-500" onClick={() => setAberto(t)}>
                  {t.previsao && t.previsao !== t.vencimento ? dataBr(t.previsao) : ""}
                </td>
                <td className="max-w-64 cursor-pointer truncate px-2 font-medium text-slate-900" onClick={() => setAberto(t)}>
                  {nomeDe(t)}
                </td>
                <td className="max-w-72 cursor-pointer truncate px-2 text-slate-600" onClick={() => setAberto(t)}>
                  {[t.descricao, t.documento && `NF ${t.documento}`].filter(Boolean).join(" · ")}
                </td>
                <td className="px-2 tabular-nums text-slate-500">{t.parcelas > 1 ? `${String(t.parcela).padStart(3, "0")}/${String(t.parcelas).padStart(3, "0")}` : ""}</td>
                <td className="max-w-56 truncate px-2 text-slate-600">{nomeCategoria.get(t.categoria_id ?? "") ?? ""}</td>
                {mostrarAcademia && <td className="px-2 text-slate-600">{nomeAcademia.get(t.academia_id)}</td>}
                <td className="px-2 text-right tabular-nums">{reais(t.valor)}</td>
                <td className="px-2 text-right tabular-nums text-slate-600">{t.pago ? reais(t.pago) : "–"}</td>
                <td className="px-2 text-right font-medium tabular-nums">{t.saldo ? reais(t.saldo) : "–"}</td>
                <td className="px-2 text-right">
                  {t.saldo > 0 && !t.cancelado && (
                    <button type="button" onClick={() => setBaixa([t])} className="whitespace-nowrap rounded border border-marca/40 px-2 py-0.5 text-xs font-medium text-marca hover:bg-marca hover:text-white">
                      {tipo === "pagar" ? "Pagar" : "Receber"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                  Nenhum título neste filtro.
                </td>
              </tr>
            )}
          </tbody>
          {lista.length > 0 && (
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 text-sm font-semibold">
              <tr>
                <td colSpan={mostrarAcademia ? 9 : 8} className="px-3 py-2 text-slate-600">
                  {selecionados.size ? `${base.length} selecionado(s)` : `${lista.length} título(s)`}
                </td>
                <td className="px-2 text-right tabular-nums">{reais(soma("valor"))}</td>
                <td className="px-2 text-right tabular-nums">{reais(soma("pago"))}</td>
                <td className="px-2 text-right tabular-nums text-marca">{reais(soma("saldo"))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {aberto && <JanelaTitulo tipo={tipo} titulo={aberto === "novo" ? null : aberto} props={propsForm} fechar={() => setAberto(null)} baixar={(t) => setBaixa([t])} />}
      {baixa && <JanelaBaixa tipo={tipo} titulos={baixa} contas={contas} nomeDe={nomeDe} fechar={() => { setBaixa(null); setAberto(null); setSelecionados(new Set()); }} />}
      {cadastro && (
        <FormularioPessoa
          inicial={{ cliente: tipo === "receber" ? "sim" : "nao", fornecedor: tipo === "pagar" ? "sim" : "nao", ativo: "sim" }}
          categorias={categoriasCadastro}
          fechar={() => setCadastro(null)}
          aoSalvar={(id, nomeNovo) => {
            setListaPessoas([...listaPessoas, { id, razao_social: nomeNovo, nome_fantasia: null, documento: null, categoria_padrao_id: null }]);
            cadastro(id);
          }}
        />
      )}
    </div>
  );
}
