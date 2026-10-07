import { Fragment } from "react";
import { lerMarkdown, trechos } from "@/lib/markdown";

// Relatório da conferência (markdown escrito pelo Claude) na tela: títulos, parágrafos, listas, tabelas e citações.
// Palavras de decisão (LIBERAR, SEGURAR, CORRIGIR) ganham cor.

const COR_DECISAO: Record<string, string> = {
  LIBERAR: "bg-emerald-100 text-emerald-800",
  SEGURAR: "bg-amber-100 text-amber-900",
  CORRIGIR: "bg-red-100 text-red-800",
};

function Linha({ texto }: { texto: string }) {
  return (
    <>
      {trechos(texto).map((t, i) => {
        const partes = t.texto.split(/\b(LIBERAR|SEGURAR|CORRIGIR)\b/);
        const conteudo = partes.map((p, j) =>
          COR_DECISAO[p] ? (
            <span key={j} className={`rounded px-1 py-0.5 text-xs font-semibold ${COR_DECISAO[p]}`}>
              {p}
            </span>
          ) : (
            <Fragment key={j}>{p}</Fragment>
          )
        );
        return t.negrito ? (
          <strong key={i} className="font-semibold text-slate-900">
            {conteudo}
          </strong>
        ) : (
          <Fragment key={i}>{conteudo}</Fragment>
        );
      })}
    </>
  );
}

const comQuebras = (texto: string) =>
  texto.split("\n").map((l, i, todas) => (
    <Fragment key={i}>
      <Linha texto={l} />
      {i < todas.length - 1 && <br />}
    </Fragment>
  ));

export function Relatorio({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {lerMarkdown(markdown).map((b, i) => {
        if (b.tipo === "titulo") {
          const classe = b.nivel === 1 ? "text-lg font-semibold text-slate-900" : b.nivel === 2 ? "mt-5 text-base font-semibold text-marca" : "mt-3 text-sm font-semibold text-slate-900";
          return (
            <p key={i} role="heading" aria-level={b.nivel} className={classe}>
              <Linha texto={b.texto} />
            </p>
          );
        }
        if (b.tipo === "paragrafo") return <p key={i}>{comQuebras(b.texto)}</p>;
        if (b.tipo === "citacao")
          return (
            <blockquote key={i} className="border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-slate-700">
              {comQuebras(b.texto)}
            </blockquote>
          );
        if (b.tipo === "linha") return <hr key={i} className="border-slate-200" />;
        if (b.tipo === "lista") {
          const Tag = b.ordenada ? "ol" : "ul";
          return (
            <Tag key={i} className={`space-y-1 pl-5 ${b.ordenada ? "list-decimal" : "list-disc"}`}>
              {b.itens.map((item, j) => (
                <li key={j}>
                  <Linha texto={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <div key={i} className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-slate-100 text-left font-semibold text-slate-700">
                <tr>
                  {b.cabecalho.map((c, j) => (
                    <th key={j} className="border border-slate-200 px-2 py-1.5 align-top">
                      <Linha texto={c} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.linhas.map((l, j) => (
                  <tr key={j} className="odd:bg-white even:bg-slate-50">
                    {l.map((c, k) => (
                      <td key={k} className="border border-slate-200 px-2 py-1.5 align-top">
                        <Linha texto={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
