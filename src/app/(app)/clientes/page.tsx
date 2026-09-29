import Link from "next/link";
import { contextoAcademias } from "@/lib/contexto";
import { AbasAcademias } from "../AbasAcademias";
import { ImportarExcel } from "../frequencia/ImportarExcel";
import { SemAcademias } from "../SemAcademias";
import { importarClientes } from "./actions";

export const maxDuration = 300;

const POR_PAGINA = 100;
const CELULA = "border border-slate-300 px-2 py-1.5";
const dia = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const moeda = (n: number | null) => (n === null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

type Cliente = {
  academia_id: string;
  cliente_id: string;
  nome: string | null;
  bairro: string | null;
  contrato: string | null;
  data_nascimento: string | null;
  genero: string | null;
  status: string | null;
  valor_contrato: number | null;
  vencimento_contrato: string | null;
};

// Clientes: o administrador importa o Excel (substitui os clientes das unidades do arquivo) e vê todas as
// unidades; o gerente vê os clientes da unidade dele (a regra de acesso do banco filtra).
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string; busca?: string; situacao?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(params.academia);
  if (academias.length === 0) return <SemAcademias admin={admin} />;

  const situacao = params.situacao === "todos" || params.situacao === "inativo" ? params.situacao : "ativo";
  const busca = (params.busca ?? "").trim();
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const unidades = selecionada ? academias.filter((a) => a.id === selecionada) : academias;

  const resumo = await Promise.all(
    unidades.map(async (a) => {
      const [total, ativos, ultima] = await Promise.all([
        supabase.from("clientes").select("cliente_id", { count: "exact", head: true }).eq("academia_id", a.id),
        supabase.from("clientes").select("cliente_id", { count: "exact", head: true }).eq("academia_id", a.id).ilike("status", "ativo"),
        supabase.from("clientes").select("importado_em").eq("academia_id", a.id).limit(1).maybeSingle(),
      ]);
      return { nome: a.nome, total: total.count ?? 0, ativos: ativos.count ?? 0, importadoEm: ultima.data?.importado_em as string | undefined };
    })
  );

  let consulta = supabase
    .from("clientes")
    .select("academia_id, cliente_id, nome, bairro, contrato, data_nascimento, genero, status, valor_contrato, vencimento_contrato", {
      count: "exact",
    })
    .order("nome")
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  if (situacao !== "todos") consulta = consulta.ilike("status", situacao);
  if (busca) consulta = consulta.ilike("nome", `%${busca.replace(/[%_]/g, "")}%`);
  const { data, count } = await consulta;
  const clientes = (data ?? []) as Cliente[];
  const paginas = Math.max(1, Math.ceil((count ?? 0) / POR_PAGINA));
  const nomeAcademia = new Map(academias.map((a) => [a.id, a.nome]));
  const link = (p: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ academia: selecionada ?? undefined, busca: busca || undefined, situacao, ...p }))
      if (v !== undefined && v !== "") q.set(k, String(v));
    return `/clientes?${q}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Clientes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cadastro de clientes vindo do sistema da rede.
          {admin && " A cada importação, os clientes das unidades do arquivo são substituídos pelos da nova planilha. O CPF não é guardado."}
        </p>
      </div>

      <AbasAcademias academias={academias} selecionada={selecionada} caminho="/clientes" />
      {admin && <ImportarExcel importar={importarClientes} rotulo="Importar clientes (todas as unidades do Excel)" />}

      <div className="overflow-auto rounded-md border border-slate-300 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className={`${CELULA} text-left`}>Unidade</th>
              <th className={`${CELULA} text-right`}>Clientes</th>
              <th className={`${CELULA} text-right`}>Ativos</th>
              <th className={`${CELULA} text-right`}>Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {resumo.map((r) => (
              <tr key={r.nome}>
                <td className={CELULA}>{r.nome}</td>
                <td className={`${CELULA} text-right tabular-nums`}>{r.total.toLocaleString("pt-BR")}</td>
                <td className={`${CELULA} text-right tabular-nums`}>{r.ativos.toLocaleString("pt-BR")}</td>
                <td className={`${CELULA} text-right`}>
                  {r.importadoEm ? new Date(r.importadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "sem importação"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lista de clientes com busca pelo nome e filtro de situação */}
      <form action="/clientes" className="flex flex-wrap items-end gap-3 text-sm">
        {selecionada && <input type="hidden" name="academia" value={selecionada} />}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Buscar pelo nome</span>
          <input name="busca" defaultValue={busca} className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Situação</span>
          <select name="situacao" defaultValue={situacao} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button className="rounded-md bg-marca px-3 py-1.5 font-medium text-white hover:bg-marca-escuro">Ver</button>
        <span className="text-slate-500">{(count ?? 0).toLocaleString("pt-BR")} clientes</span>
      </form>

      <div className="overflow-auto rounded-md border border-slate-300 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className={`${CELULA} text-left`}>ID</th>
              <th className={`${CELULA} text-left`}>Nome</th>
              {!selecionada && <th className={`${CELULA} text-left`}>Unidade</th>}
              <th className={`${CELULA} text-left`}>Plano</th>
              <th className={`${CELULA} text-right`}>Valor</th>
              <th className={`${CELULA} text-right`}>Vencimento</th>
              <th className={`${CELULA} text-right`}>Nascimento</th>
              <th className={`${CELULA} text-center`}>Gênero</th>
              <th className={`${CELULA} text-left`}>Bairro</th>
              <th className={`${CELULA} text-left`}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 && (
              <tr>
                <td colSpan={10} className={`${CELULA} py-6 text-center text-slate-500`}>
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <tr key={`${c.academia_id}${c.cliente_id}`} className="hover:bg-slate-50">
                <td className={`${CELULA} tabular-nums text-slate-500`}>{c.cliente_id}</td>
                <td className={CELULA}>{c.nome}</td>
                {!selecionada && <td className={CELULA}>{nomeAcademia.get(c.academia_id)}</td>}
                <td className={CELULA}>{c.contrato ?? "—"}</td>
                <td className={`${CELULA} text-right tabular-nums`}>{moeda(c.valor_contrato)}</td>
                <td className={`${CELULA} text-right`}>{dia(c.vencimento_contrato)}</td>
                <td className={`${CELULA} text-right`}>{dia(c.data_nascimento)}</td>
                <td className={`${CELULA} text-center`}>{c.genero ?? "—"}</td>
                <td className={CELULA}>{c.bairro ?? "—"}</td>
                <td className={CELULA}>{c.status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {pagina > 1 && (
            <Link href={link({ pagina: pagina - 1 })} className="text-marca underline">
              ‹ Anterior
            </Link>
          )}
          <span className="text-slate-500">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={link({ pagina: pagina + 1 })} className="text-marca underline">
              Próxima ›
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
