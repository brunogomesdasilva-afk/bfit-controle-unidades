"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ResultadoImportacao } from "./importar";

const LIMITE_MB = 50;

// Botão que abre a janela de escolha de arquivo do próprio computador e envia o Excel para o sistema.
// O arquivo vai direto para a pasta do usuário no armazenamento do Supabase (sem o limite de tamanho do
// servidor do site) e depois o sistema o importa.
export function ImportarExcel({
  importar,
  rotulo,
}: {
  importar: (arquivo: { caminho: string; nome: string }) => Promise<ResultadoImportacao>;
  rotulo: string;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar() {
    const escolhido = campo.current?.files?.[0];
    if (!escolhido) return;
    if (!escolhido.name.toLowerCase().endsWith(".xlsx")) {
      setResultado({ erro: "O arquivo precisa ser Excel (.xlsx)." });
      return;
    }
    if (escolhido.size > LIMITE_MB * 1024 * 1024) {
      setResultado({ erro: `Arquivo muito grande (máximo ${LIMITE_MB} MB). Divida o relatório em partes.` });
      return;
    }
    setResultado(null);
    iniciar(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setResultado({ erro: "Sua sessão expirou. Entre novamente." });
        return;
      }
      const caminho = `${user.id}/${Date.now()}.xlsx`;
      const { error } = await supabase.storage.from("importacoes").upload(caminho, escolhido, {
        contentType: escolhido.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      if (error) {
        setResultado({ erro: `Não foi possível enviar o arquivo: ${error.message}` });
        return;
      }
      const r = await importar({ caminho, nome: escolhido.name });
      setResultado(r);
      if (!r.erro) {
        setArquivo(null);
        if (campo.current) campo.current.value = "";
      }
    });
  }

  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={campo}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            setArquivo(e.target.files?.[0]?.name ?? null);
            setResultado(null);
          }}
        />
        <button
          type="button"
          onClick={() => campo.current?.click()}
          disabled={enviando}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Escolher arquivo Excel…
        </button>
        <span className="text-sm text-slate-600">{arquivo ?? "Nenhum arquivo escolhido"}</span>
        <button
          type="button"
          onClick={enviar}
          disabled={!arquivo || enviando}
          className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
        >
          {enviando ? "Importando…" : rotulo}
        </button>
      </div>
      {resultado?.erro && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
      {resultado?.ok && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
    </div>
  );
}

// Botão "Desfazer" de uma importação da lista.
export function DesfazerImportacao({ desfazer }: { desfazer: () => Promise<ResultadoImportacao> }) {
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => {
          if (!window.confirm("Desfazer esta importação? As linhas que vieram deste arquivo serão apagadas.")) return;
          iniciar(async () => setErro((await desfazer()).erro ?? null));
        }}
        className="text-xs text-red-700 underline hover:text-red-900 disabled:text-slate-400"
      >
        {enviando ? "Desfazendo…" : "Desfazer"}
      </button>
      {erro && <span className="ml-2 text-xs text-red-700">{erro}</span>}
    </>
  );
}
