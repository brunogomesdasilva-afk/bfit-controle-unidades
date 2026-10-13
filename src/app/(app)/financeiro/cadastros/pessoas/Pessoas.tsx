"use client";

import { useMemo, useState, useTransition } from "react";
import { formatarDocumento, nomePessoa, REGIMES, soNumeros, type Pessoa } from "@/lib/financeiro";
import { buscarCnpj, salvarPessoa } from "../../acoes";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Escolha, Janela, Mensagem, Texto } from "../../componentes";

// Cadastro de clientes e fornecedores (a mesma tabela): lista com busca e a janela de inclusão/alteração, que
// preenche os dados da Receita pelo CNPJ.

type Opcao = { valor: string; rotulo: string; grupo?: string; tipo?: string };
const VAZIA: Record<string, string> = { cliente: "nao", fornecedor: "sim", ativo: "sim" };

export function FormularioPessoa({ inicial, categorias, fechar, aoSalvar }: { inicial: Record<string, string>; categorias: Opcao[]; fechar: () => void; aoSalvar?: (id: string, nome: string) => void }) {
  const [d, setD] = useState<Record<string, string>>(inicial);
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campo = (c: string) => ({ valor: d[c] ?? "", mudar: (v: string) => setD({ ...d, [c]: v }) });
  const doc = soNumeros(d.documento);
  // Fornecedor escolhe entre as categorias de pagar; cliente, entre as de receber; quem é os dois, entre todas.
  const tiposCategoria = [d.fornecedor === "sim" && "despesa", d.cliente === "sim" && "receita"].filter(Boolean);
  const opcoesCategoria = categorias.filter((c) => !c.tipo || c.tipo === "transferencia" || !tiposCategoria.length || tiposCategoria.includes(c.tipo) || c.valor === d.categoria_padrao_id);

  const receita = () =>
    iniciar(async () => {
      const r = await buscarCnpj(doc);
      if (r.erro || !r.dados) return setM({ erro: r.erro ?? "Não encontrado." });
      const { situacao, ...dados } = r.dados;
      setD({ ...d, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v)) });
      setM(situacao === "ATIVA" ? { ok: "Dados preenchidos pela Receita (situação ATIVA)." } : { erro: `Atenção: situação cadastral na Receita: ${situacao}.` });
    });
  const salvar = () =>
    iniciar(async () => {
      const r = await salvarPessoa(d.id || null, d);
      setM(r);
      if (r.ok && r.id) {
        aoSalvar?.(r.id, d.nome_fantasia || d.razao_social);
        fechar();
      }
    });

  return (
    <Janela titulo={d.id ? "Alterar cadastro" : "Incluir cliente ou fornecedor"} fechar={fechar} largura="max-w-4xl">
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 flex items-end gap-2">
            <Texto rotulo="CPF ou CNPJ" {...campo("documento")} className="flex-1" />
            <button type="button" onClick={receita} disabled={ocupado || doc.length !== 14} className={BOTAO_SECUNDARIO} title="Preenche pela Receita Federal">
              Buscar na Receita
            </button>
          </div>
          <Escolha rotulo="É fornecedor?" {...campo("fornecedor")} opcoes={[{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }]} vazio="—" />
          <Escolha rotulo="É cliente?" {...campo("cliente")} opcoes={[{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }]} vazio="—" />
          <Texto rotulo="Razão social (ou nome)" {...campo("razao_social")} className="md:col-span-2" />
          <Texto rotulo="Nome fantasia" {...campo("nome_fantasia")} className="md:col-span-2" />
          <Escolha rotulo="Regime tributário" {...campo("regime_tributario")} opcoes={REGIMES.map((r) => ({ valor: r, rotulo: r }))} vazio="—" />
          <Texto rotulo="CNAE principal" {...campo("cnae")} className="md:col-span-3" />
          <Texto rotulo="Inscrição estadual" {...campo("inscricao_estadual")} />
          <Texto rotulo="Inscrição municipal" {...campo("inscricao_municipal")} />
          <Escolha rotulo="Categoria padrão (vem preenchida nos lançamentos)" {...campo("categoria_padrao_id")} opcoes={opcoesCategoria} vazio="—" className="md:col-span-2" />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-marca">Contato e endereço</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Texto rotulo="E-mail" {...campo("email")} className="md:col-span-2" />
            <Texto rotulo="Telefone" {...campo("telefone")} />
            <Texto rotulo="Pessoa de contato" {...campo("contato")} />
            <Texto rotulo="CEP" {...campo("cep")} />
            <Texto rotulo="Logradouro" {...campo("logradouro")} className="md:col-span-2" />
            <Texto rotulo="Número" {...campo("numero")} />
            <Texto rotulo="Complemento" {...campo("complemento")} />
            <Texto rotulo="Bairro" {...campo("bairro")} />
            <Texto rotulo="Cidade" {...campo("cidade")} />
            <Texto rotulo="UF" {...campo("uf")} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-marca">Dados bancários para pagamento</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Texto rotulo="Banco" {...campo("banco")} placeholder="ex.: 237 Bradesco" />
            <Texto rotulo="Agência" {...campo("agencia")} />
            <Texto rotulo="Conta" {...campo("conta")} />
            <Escolha rotulo="Tipo de conta" {...campo("tipo_conta")} opcoes={["Corrente", "Poupança", "Pagamento"].map((t) => ({ valor: t, rotulo: t }))} vazio="—" />
            <Texto rotulo="Titular da conta" {...campo("titular_conta")} className="md:col-span-2" />
            <Escolha rotulo="Tipo da chave PIX" {...campo("tipo_chave_pix")} opcoes={["CPF/CNPJ", "E-mail", "Celular", "Aleatória"].map((t) => ({ valor: t, rotulo: t }))} vazio="—" />
            <Texto rotulo="Chave PIX" {...campo("chave_pix")} />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Texto rotulo="Observações" {...campo("observacoes")} className="md:col-span-3" />
          <Escolha rotulo="Ativo" {...campo("ativo")} opcoes={[{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }]} vazio="—" />
        </section>

        <Mensagem m={m} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={ocupado} className={BOTAO_PRIMARIO}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </Janela>
  );
}

const paraForm = (p: Pessoa): Record<string, string> =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "sim" : "nao") : (v ?? "") as string]));

export function Pessoas({ pessoas, categorias }: { pessoas: Pessoa[]; categorias: Opcao[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "fornecedor" | "cliente" | "inativos">("todos");
  const [editando, setEditando] = useState<Record<string, string> | null>(null);
  const nomeCategoria = useMemo(() => new Map(categorias.map((c) => [c.valor, c.rotulo])), [categorias]);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const bd = soNumeros(busca);
    return pessoas.filter(
      (p) =>
        (filtro === "inativos" ? !p.ativo : p.ativo) &&
        (filtro !== "fornecedor" || p.fornecedor) &&
        (filtro !== "cliente" || p.cliente) &&
        (!b || `${p.razao_social} ${p.nome_fantasia ?? ""}`.toLowerCase().includes(b) || (bd.length >= 3 && (p.documento ?? "").includes(bd)))
    );
  }, [pessoas, busca, filtro]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF/CNPJ" className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        {(["todos", "fornecedor", "cliente", "inativos"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-sm ${filtro === f ? "bg-marca text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {{ todos: "Todos", fornecedor: "Fornecedores", cliente: "Clientes", inativos: "Inativos" }[f]}
          </button>
        ))}
        <button type="button" onClick={() => setEditando({ ...VAZIA })} className={`${BOTAO_PRIMARIO} ml-auto`}>
          + Incluir
        </button>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">CPF/CNPJ</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Categoria padrão</th>
              <th className="px-3 py-2">Regime</th>
              <th className="px-3 py-2">Cidade/UF</th>
              <th className="px-3 py-2">PIX / banco</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, 500).map((p) => (
              <tr key={p.id} onClick={() => setEditando(paraForm(p))} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50">
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-900">{nomePessoa(p)}</span>
                  {p.nome_fantasia && p.nome_fantasia !== p.razao_social && <span className="block text-xs text-slate-500">{p.razao_social}</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatarDocumento(p.documento)}</td>
                <td className="px-3 py-2">{[p.fornecedor && "Fornecedor", p.cliente && "Cliente"].filter(Boolean).join(" e ")}</td>
                <td className="px-3 py-2">{p.categoria_padrao_id ? (nomeCategoria.get(p.categoria_padrao_id) ?? "") : <span className="text-xs text-amber-700">sem categoria</span>}</td>
                <td className="px-3 py-2">{p.regime_tributario ?? ""}</td>
                <td className="px-3 py-2">{[p.cidade, p.uf].filter(Boolean).join("/")}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{p.chave_pix ? `PIX ${p.chave_pix}` : [p.banco, p.agencia && `ag ${p.agencia}`, p.conta && `cc ${p.conta}`].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Nenhum cadastro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{lista.length} cadastros{lista.length > 500 ? " (mostrando 500; refine a busca)" : ""}. Clique numa linha para alterar.</p>
      {editando && <FormularioPessoa inicial={editando} categorias={categorias} fechar={() => setEditando(null)} />}
    </div>
  );
}
