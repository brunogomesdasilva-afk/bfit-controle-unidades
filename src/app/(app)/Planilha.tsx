"use client";

import { useState, useTransition, type KeyboardEvent, type ReactNode } from "react";

// Tabela no estilo de planilha: cabeçalho fixo, linhas numeradas e edição direto na linha.
// "+ Nova linha" abre uma linha em branco no topo; "Alterar" (ou duplo clique) edita a linha.
// Enter salva e Esc cancela.

export type Coluna = {
  campo: string;
  rotulo: string;
  // "calculado", "percentual" e "situacao" só aparecem (vêm prontos do servidor, em cinza); os demais são
  // preenchidos na linha.
  tipo: "texto" | "data" | "hora" | "opcoes" | "inteiro" | "decimal" | "moeda" | "calculado" | "percentual" | "info" | "situacao";
  // "filtro" liga a opção a um valor de outra coluna (ex.: funcionário → cargo), usado com "dependeDe".
  opcoes?: { valor: string; rotulo: string; filtro?: string }[];
  // Só mostra as opções cujo filtro é igual ao valor escolhido nesta outra coluna (ex.: nome depende do cargo).
  dependeDe?: string;
  obrigatorio?: boolean;
  largura?: string;
  // Valor travado: aparece na edição mas não pode ser mudado (ex.: a academia da aba aberta).
  fixa?: boolean;
  // Colunas vizinhas com o mesmo grupo ganham um cabeçalho mesclado em cima (ex.: "Inventário de máquinas").
  grupo?: string;
  // Coluna "calculado" mostrada em reais (ex.: preço de venda calculado).
  emReais?: boolean;
};

const NUMERICOS = new Set<Coluna["tipo"]>(["inteiro", "decimal", "moeda", "calculado", "percentual"]);
const SO_EXIBICAO = new Set<Coluna["tipo"]>(["calculado", "percentual", "info", "situacao"]);

// Horários sempre de 30 em 30 minutos: 00:00, 00:30 ... 23:30.
const HORARIOS = Array.from({ length: 48 }, (_, i) => {
  const h = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  return { valor: h, rotulo: h };
});

export type Linha = { id: string } & Record<string, string | null>;

export type Resultado = { erro?: string };

const COR_SITUACAO: Record<string, string> = {
  Pendente: "bg-amber-100 text-amber-800",
  Concluído: "bg-emerald-100 text-emerald-800",
};

function formatarData(valor: string | null) {
  if (!valor) return "";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function exibir(coluna: Coluna, valor: string | null) {
  if (coluna.tipo === "data") return formatarData(valor);
  if (coluna.tipo === "hora") return (valor ?? "").slice(0, 5);
  // Opção que saiu da lista (ex.: modalidade renomeada) continua aparecendo com o valor gravado.
  if (coluna.tipo === "opcoes") return coluna.opcoes?.find((o) => o.valor === valor)?.rotulo ?? valor ?? "";
  if (NUMERICOS.has(coluna.tipo) && valor !== null && valor !== "") {
    const n = Number(valor);
    if (coluna.tipo === "moeda" || coluna.emReais) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (coluna.tipo === "percentual")
      return n.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return valor ?? "";
}

// Valor que vai para o campo de edição: números com vírgula decimal, como se digita no Brasil.
function paraEdicao(coluna: Coluna, valor: string | null) {
  if (valor === null) return "";
  if (coluna.tipo === "decimal" || coluna.tipo === "moeda") return valor.replace(".", ",");
  if (coluna.tipo === "hora") return valor.slice(0, 5);
  return valor;
}

// Monta a linha de cima do cabeçalho: grupos mesclados e colunas sem grupo ocupando as duas linhas.
function gruposDoCabecalho(colunas: Coluna[]) {
  const blocos: { grupo?: string; colunas: Coluna[] }[] = [];
  for (const c of colunas) {
    const ultimo = blocos[blocos.length - 1];
    if (c.grupo && ultimo?.grupo === c.grupo) ultimo.colunas.push(c);
    else blocos.push({ grupo: c.grupo, colunas: [c] });
  }
  return blocos;
}

const CELULA = "border border-slate-300 px-2 py-1.5 align-middle";

function CabecalhoColuna({ coluna, linhas }: { coluna: Coluna; linhas: number }) {
  return (
    <th
      rowSpan={linhas}
      className={`${CELULA} ${coluna.largura ?? ""} ${NUMERICOS.has(coluna.tipo) ? "text-right" : ""} ${
        SO_EXIBICAO.has(coluna.tipo) && coluna.tipo !== "situacao" ? "bg-slate-200" : ""
      }`}
      title={SO_EXIBICAO.has(coluna.tipo) && coluna.tipo !== "situacao" ? "Automático: não é preenchido" : undefined}
    >
      {coluna.rotulo}
      {coluna.obrigatorio && <span className="text-red-500"> *</span>}
    </th>
  );
}

const CAMPO = "w-full rounded-sm border border-marca/40 bg-white px-1.5 py-1 text-sm outline-none focus:border-marca";

export function Planilha({
  colunas,
  linhas,
  salvar,
  excluir,
  padroesNovo = {},
  rotuloNovo = "+ Nova linha",
  vazio = "Nenhum registro ainda. Clique em “+ Nova linha” para incluir.",
  somenteLeitura,
  numeroInicial = 1,
  barra,
}: {
  colunas: Coluna[];
  linhas: Linha[];
  // Sem "salvar" a planilha é só de consulta (ex.: relatórios importados).
  salvar?: (id: string | null, dados: Record<string, string>) => Promise<Resultado>;
  excluir?: (id: string) => Promise<Resultado>;
  padroesNovo?: Record<string, string>;
  rotuloNovo?: string;
  vazio?: string;
  // Quando preenchido, a planilha só mostra os dados (sem incluir, alterar ou excluir) e exibe este aviso.
  somenteLeitura?: string;
  // Número da primeira linha (em telas com paginação, continua a contagem da página anterior).
  numeroInicial?: number;
  // Controles mostrados na mesma linha do botão de incluir (ex.: o seletor de mês).
  barra?: ReactNode;
}) {
  const editaveis = colunas.filter((c) => !SO_EXIBICAO.has(c.tipo));
  const temGrupos = colunas.some((c) => c.grupo);
  // O cursor começa no primeiro campo que pode ser mudado.
  const primeiroCampo = editaveis.find((c) => !c.fixa)?.campo;
  const [editando, setEditando] = useState<string | null>(null); // id da linha, "novo" ou nada
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function abrirNovo() {
    const inicial: Record<string, string> = {};
    for (const c of editaveis) inicial[c.campo] = padroesNovo[c.campo] ?? "";
    setRascunho(inicial);
    setEditando("novo");
    setErro(null);
  }

  function abrirEdicao(linha: Linha) {
    if (salvando) return;
    const inicial: Record<string, string> = {};
    for (const c of editaveis) inicial[c.campo] = paraEdicao(c, linha[c.campo]);
    setRascunho(inicial);
    setEditando(linha.id);
    setErro(null);
  }

  // Ao trocar um valor, limpa as colunas que dependem dele (ex.: trocou o cargo, escolhe o nome de novo).
  function escolher(campo: string, valor: string) {
    const novo = { ...rascunho, [campo]: valor };
    for (const c of colunas) if (c.dependeDe === campo) novo[c.campo] = "";
    setRascunho(novo);
  }

  function opcoesVisiveis(c: Coluna) {
    const opcoes = c.opcoes ?? [];
    return c.dependeDe ? opcoes.filter((o) => o.filtro === rascunho[c.dependeDe!]) : opcoes;
  }

  function cancelar() {
    setEditando(null);
    setErro(null);
  }

  function confirmar() {
    if (!salvar) return;
    const faltando = editaveis.find((c) => c.obrigatorio && !rascunho[c.campo]?.trim());
    if (faltando) {
      setErro(`Preencha “${faltando.rotulo}”.`);
      return;
    }
    iniciar(async () => {
      const r = await salvar(editando === "novo" ? null : editando, rascunho);
      setErro(r.erro ?? null);
      if (!r.erro) setEditando(null);
    });
  }

  function remover(linha: Linha) {
    if (!excluir) return;
    if (!window.confirm("Excluir esta linha? Essa ação não pode ser desfeita.")) return;
    iniciar(async () => {
      const r = await excluir(linha.id);
      setErro(r.erro ?? null);
    });
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "Escape") cancelar();
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "SELECT") {
      e.preventDefault();
      confirmar();
    }
  }

  function linhaEmEdicao(chave: string, numero: string) {
    return (
      <tr key={chave} className="bg-amber-50" onKeyDown={aoTeclar}>
        <td className={`${CELULA} bg-slate-100 text-center text-xs text-slate-500`}>{numero}</td>
        {colunas.map((c) => (
          <td key={c.campo} className={CELULA}>
            {SO_EXIBICAO.has(c.tipo) ? null : c.fixa ? (
              <span className="px-1.5 text-slate-700">{exibir(c, rascunho[c.campo] ?? null)}</span>
            ) : c.tipo === "opcoes" || c.tipo === "hora" ? (
              <select
                autoFocus={c.campo === primeiroCampo}
                value={rascunho[c.campo] ?? ""}
                onChange={(e) => escolher(c.campo, e.target.value)}
                className={`${CAMPO} ${c.tipo === "hora" ? "tabular-nums" : ""}`}
                aria-label={c.rotulo}
              >
                <option value="">
                  {c.tipo === "hora"
                    ? "--:--"
                    : c.dependeDe && !rascunho[c.dependeDe]
                      ? `Escolha antes: ${colunas.find((d) => d.campo === c.dependeDe)?.rotulo ?? ""}`
                      : "Selecione…"}
                </option>
                {(c.tipo === "hora" ? HORARIOS : opcoesVisiveis(c)).map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus={c.campo === primeiroCampo}
                type={c.tipo === "data" ? "date" : "text"}
                inputMode={c.tipo === "inteiro" ? "numeric" : NUMERICOS.has(c.tipo) ? "decimal" : undefined}
                value={rascunho[c.campo] ?? ""}
                onChange={(e) => setRascunho({ ...rascunho, [c.campo]: e.target.value })}
                className={`${CAMPO} ${NUMERICOS.has(c.tipo) ? "text-right" : ""}`}
                aria-label={c.rotulo}
              />
            )}
          </td>
        ))}
        <td className={`${CELULA} whitespace-nowrap`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={salvando}
              className="rounded-md bg-marca px-2.5 py-1 text-xs font-medium text-white hover:bg-marca-escuro disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={cancelar}
              disabled={salvando}
              className="text-xs text-slate-600 underline hover:text-slate-900"
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div>
      {somenteLeitura ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {barra}
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">{somenteLeitura}</p>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {barra}
          <button
            type="button"
            onClick={abrirNovo}
            disabled={editando !== null}
            className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
          >
            {rotuloNovo}
          </button>
          <p className="ml-auto hidden text-xs text-slate-500 md:block">Duplo clique na linha para alterar · Enter salva · Esc cancela</p>
        </div>
      )}

      {erro && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-md border border-slate-300 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th rowSpan={temGrupos ? 2 : 1} className={`${CELULA} w-10 text-center`}>
                #
              </th>
              {gruposDoCabecalho(colunas).map((bloco) =>
                bloco.grupo ? (
                  <th
                    key={bloco.grupo}
                    colSpan={bloco.colunas.length}
                    className={`${CELULA} bg-slate-200 text-center`}
                  >
                    {bloco.grupo}
                  </th>
                ) : (
                  bloco.colunas.map((c) => (
                    <CabecalhoColuna key={c.campo} coluna={c} linhas={temGrupos ? 2 : 1} />
                  ))
                )
              )}
              {!somenteLeitura && (
                <th rowSpan={temGrupos ? 2 : 1} className={`${CELULA} w-40`}>
                  Ações
                </th>
              )}
            </tr>
            {temGrupos && (
              <tr>
                {colunas
                  .filter((c) => c.grupo)
                  .map((c) => (
                    <CabecalhoColuna key={c.campo} coluna={c} linhas={1} />
                  ))}
              </tr>
            )}
          </thead>
          <tbody>
            {editando === "novo" && linhaEmEdicao("novo", "*")}

            {linhas.length === 0 && editando !== "novo" && (
              <tr>
                <td colSpan={colunas.length + (somenteLeitura ? 1 : 2)} className={`${CELULA} py-8 text-center text-slate-500`}>
                  {vazio}
                </td>
              </tr>
            )}

            {linhas.map((linha, i) =>
              editando === linha.id ? (
                linhaEmEdicao(linha.id, String(i + 1))
              ) : (
                <tr
                  key={linha.id}
                  onDoubleClick={() => !somenteLeitura && editando === null && abrirEdicao(linha)}
                  className="hover:bg-slate-50"
                >
                  <td className={`${CELULA} bg-slate-50 text-center text-xs text-slate-400`}>{numeroInicial + i}</td>
                  {colunas.map((c) => (
                    <td
                      key={c.campo}
                      className={`${CELULA} ${c.tipo === "data" || c.tipo === "hora" ? "whitespace-nowrap tabular-nums" : ""} ${
                        NUMERICOS.has(c.tipo) ? "whitespace-nowrap text-right tabular-nums" : ""
                      } ${SO_EXIBICAO.has(c.tipo) && c.tipo !== "situacao" ? "bg-slate-100 font-medium text-slate-700" : ""}`}
                    >
                      {c.tipo === "situacao" ? (
                        linha[c.campo] && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              COR_SITUACAO[linha[c.campo] ?? ""] ?? "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {linha[c.campo]}
                          </span>
                        )
                      ) : (
                        exibir(c, linha[c.campo])
                      )}
                    </td>
                  ))}
                  {!somenteLeitura && (
                  <td className={`${CELULA} whitespace-nowrap`}>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(linha)}
                        disabled={editando !== null}
                        className="text-xs font-medium text-marca underline hover:text-marca-escuro disabled:text-slate-400 disabled:no-underline"
                      >
                        Alterar
                      </button>
                      {excluir && (
                        <button
                          type="button"
                          onClick={() => remover(linha)}
                          disabled={editando !== null || salvando}
                          className="text-xs text-red-700 underline hover:text-red-900 disabled:text-slate-400 disabled:no-underline"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
