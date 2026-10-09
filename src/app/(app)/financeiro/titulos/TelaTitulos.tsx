import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import type { Titulo, TipoTitulo } from "@/lib/financeiro";
import { hoje } from "@/lib/planilha";
import { listasFinanceiro } from "../listas";
import { Titulos } from "./Titulos";

// Tela de contas a pagar ou a receber (mesmos campos). Filtros na URL: academia, situação e período de vencimento.

const FILTROS = {
  abertos: "Em aberto",
  vencidos: "Vencidos",
  liquidados: "Liquidados",
  todos: "Todos",
  cancelados: "Cancelados",
} as const;
type Filtro = keyof typeof FILTROS;

export async function TelaTitulos({ tipo, searchParams }: { tipo: TipoTitulo; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirModulo("financeiro");
  const params = await searchParams;
  const p = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const { supabase, academias, selecionada } = await contextoAcademias(p("academia"));
  const filtro: Filtro = (p("filtro") as Filtro) in FILTROS ? (p("filtro") as Filtro) : "abertos";
  const de = p("de") ?? "";
  const ate = p("ate") ?? "";
  const caminho = tipo === "pagar" ? "/financeiro/pagar" : "/financeiro/receber";

  let consulta = supabase.from("fin_titulos_situacao").select("*").eq("tipo", tipo).order("vencimento").order("criado_em").limit(3000);
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  if (filtro === "abertos") consulta = consulta.in("situacao", ["aberto", "vencido", "parcial"]);
  if (filtro === "vencidos") consulta = consulta.lt("vencimento", hoje()).in("situacao", ["vencido", "parcial"]);
  if (filtro === "liquidados") consulta = consulta.eq("situacao", "liquidado");
  if (filtro === "cancelados") consulta = consulta.eq("situacao", "cancelado");
  if (filtro === "todos") consulta = consulta.neq("situacao", "cancelado");
  if (de) consulta = consulta.gte("vencimento", de);
  if (ate) consulta = consulta.lte("vencimento", ate);
  const [{ data }, listas, { data: feriados }] = await Promise.all([consulta, listasFinanceiro(supabase), supabase.from("feriados").select("data, academia_id")]);
  const titulos = ((data ?? []) as Titulo[]).map((t) => ({
    ...t,
    valor: Number(t.valor),
    baixado: Number(t.baixado),
    pago: Number(t.pago),
    saldo: Number(t.saldo),
    ret_iss: Number(t.ret_iss),
    ret_irrf: Number(t.ret_irrf),
    ret_inss: Number(t.ret_inss),
    ret_pis: Number(t.ret_pis),
    ret_cofins: Number(t.ret_cofins),
    ret_csll: Number(t.ret_csll),
  }));

  const link = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ academia: selecionada, filtro, de, ate, ...mudar })) if (v) q.set(k, v);
    return `${caminho}?${q.toString()}`;
  };
  const pessoas = listas.pessoas
    .filter((x) => x.ativo && (tipo === "pagar" ? x.fornecedor : x.cliente))
    .map((x) => ({ id: x.id, razao_social: x.razao_social, nome_fantasia: x.nome_fantasia, documento: x.documento, categoria_padrao_id: x.categoria_padrao_id }));
  // Títulos já lançados com quem deixou de ser cliente/fornecedor continuam mostrando o nome.
  for (const t of titulos) {
    if (t.pessoa_id && !pessoas.some((x) => x.id === t.pessoa_id)) {
      const x = listas.pessoas.find((y) => y.id === t.pessoa_id);
      if (x) pessoas.push({ id: x.id, razao_social: x.razao_social, nome_fantasia: x.nome_fantasia, documento: x.documento, categoria_padrao_id: x.categoria_padrao_id });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{tipo === "pagar" ? "Contas a pagar" : "Contas a receber"}</h1>
        <p className="text-sm text-slate-500">
          Clique num título para ver os dados, as baixas e o histórico. Para {tipo === "pagar" ? "pagar" : "receber"} vários de uma vez, marque e use o
          botão de cima. Baixa parcial deixa o restante em aberto.
        </p>
      </div>

      {academias.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Academias">
          {[{ id: null as string | null, nome: "Todas" }, ...academias].map((a) => (
            <Link
              key={a.id ?? "todas"}
              href={link({ academia: a.id })}
              className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${a.id === selecionada ? "border-slate-200 border-b-white bg-white font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
      )}

      <form className="flex flex-wrap items-end gap-3" action={caminho}>
        {selecionada && <input type="hidden" name="academia" value={selecionada} />}
        <input type="hidden" name="filtro" value={filtro} />
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(FILTROS) as [Filtro, string][]).map(([k, r]) => (
            <Link key={k} href={link({ filtro: k })} className={`rounded-full px-3 py-1 text-sm ${k === filtro ? "bg-marca font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {r}
            </Link>
          ))}
        </div>
        <label className="text-xs text-slate-600">
          Vencimento de
          <input type="date" name="de" defaultValue={de} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-600">
          até
          <input type="date" name="ate" defaultValue={ate} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
          Filtrar
        </button>
        {(de || ate) && (
          <Link href={link({ de: null, ate: null })} className="text-sm text-slate-500 underline">
            limpar datas
          </Link>
        )}
      </form>

      <Titulos
        key={`${selecionada}-${filtro}-${de}-${ate}`}
        tipo={tipo}
        titulos={titulos}
        academias={(selecionada ? academias.filter((a) => a.id === selecionada) : academias).map((a) => ({ valor: a.id, rotulo: a.nome }))}
        pessoas={pessoas}
        categorias={listas.opcoesCategoria(tipo === "pagar" ? "despesa" : "receita")}
        categoriasCadastro={listas.opcoesCategoria()}
        contas={listas.contas.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome, academia_id: c.academia_id }))}
        mostrarAcademia={!selecionada}
        feriados={(feriados ?? []) as { data: string; academia_id: string | null }[]}
      />
    </div>
  );
}
