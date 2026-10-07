"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Relatorio } from "../rh/folha/Relatorio";

// Conferência de pagamentos de uma academia: envia o .zip do lote, mostra o relatório enquanto o Claude escreve
// e, no fim, o PDF. Pode haver vários lotes no mês (um por fluxo).

export type ConferenciaExibida = {
  id: string;
  status: "processando" | "conferida" | "erro";
  relatorio: string | null;
  arquivoNome: string;
  criadoEm: string;
  criadoPor: string;
  interrompida: boolean;
};

const LIMITE_MB = 50;
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const BOTAO = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";

export function ConferenciaPagamentos({
  academiaId,
  mes,
  mesTexto,
  exibida,
  chaveConfigurada,
}: {
  academiaId: string;
  mes: string;
  mesTexto: string;
  exibida: ConferenciaExibida | null;
  chaveConfigurada: boolean;
}) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement | null>(null);
  const [escolhido, setEscolhido] = useState("");
  const [fase, setFase] = useState<"parado" | "enviando" | "conferindo">("parado");
  const [texto, setTexto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ erro?: string; ok?: string } | null>(null);
  const [atualizando, iniciar] = useTransition();
  const ocupado = fase !== "parado" || atualizando;

  async function conferir() {
    const zip = campo.current?.files?.[0];
    if (!zip) return;
    if (!zip.name.toLowerCase().endsWith(".zip")) {
      setMensagem({ erro: "Envie a pasta compactada em .zip (no Windows: botão direito na pasta > Compactar para arquivo ZIP)." });
      return;
    }
    if (zip.size > LIMITE_MB * 1024 * 1024) {
      setMensagem({ erro: `O .zip tem ${(zip.size / 1024 / 1024).toFixed(0)} MB; o máximo é ${LIMITE_MB} MB. Divida o lote em dois.` });
      return;
    }
    setMensagem(null);
    setTexto("");
    setFase("enviando");
    try {
      // O .zip vai direto para a pasta da academia no armazenamento (só o módulo Financeiro lê).
      const caminho = `${academiaId}/${mes}/${Date.now()}.zip`;
      const { error } = await createClient().storage.from("pagamentos").upload(caminho, zip, { contentType: "application/zip" });
      if (error) throw new Error(`Não foi possível enviar o .zip: ${error.message}`);

      setFase("conferindo");
      const resposta = await fetch("/financeiro/conferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academia: academiaId, mes, nome: zip.name, caminho }),
      });
      if (!resposta.ok || !resposta.body) throw new Error((await resposta.text()) || "A conferência não começou.");
      // O relatório chega aos poucos e aparece na tela enquanto é escrito.
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let acumulado = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        setTexto(acumulado);
      }
      setMensagem({ ok: "Conferência concluída." });
      if (campo.current) campo.current.value = "";
      setEscolhido("");
    } catch (e) {
      setMensagem({ erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setFase("parado");
      // Recarrega a conferência gravada; o texto recebido some só quando ela chega (sem piscar a tela).
      iniciar(() => {
        router.push(`/financeiro?academia=${academiaId}&mes=${mes}`);
        router.refresh();
        setTexto(null);
      });
    }
  }

  const relatorio = texto ?? exibida?.relatorio ?? null;
  const pronto = texto === null && exibida && (exibida.status !== "processando" || exibida.interrompida);

  return (
    <div className="space-y-4">
      {!chaveConfigurada && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A conferência ainda não está ativa: falta configurar a chave da API da Anthropic (ANTHROPIC_API_KEY) no servidor.
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm text-slate-600">
          Compacte a pasta do lote de {mesTexto} em .zip e envie: fluxo de pagamentos (Excel), notas, boletos, guias, fatura
          do cartão com os comprovantes e o que mais houver. O que faltar aparece como pendência no relatório.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={campo}
            type="file"
            accept=".zip,application/zip"
            disabled={ocupado}
            onChange={(e) => setEscolhido(e.target.files?.[0]?.name ?? "")}
            className="block text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button type="button" onClick={conferir} disabled={ocupado || !chaveConfigurada || !escolhido} className={`${BOTAO} bg-marca text-white hover:bg-marca-escuro`}>
            {fase === "enviando" ? "Enviando o .zip…" : fase === "conferindo" ? "Conferindo…" : "Conferir pagamentos"}
          </button>
          {fase === "conferindo" && <span className="text-xs text-slate-500">A conferência leva vários minutos. Mantenha esta página aberta.</span>}
        </div>
      </div>

      {mensagem?.erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{mensagem.erro}</p>}
      {mensagem?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensagem.ok}</p>}

      {relatorio !== null && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          {exibida && texto === null && (
            <p className="mb-4 text-xs text-slate-500">
              {exibida.status === "erro" || exibida.interrompida ? "Conferência incompleta" : exibida.status === "processando" ? "Conferindo" : "Conferência"} do lote{" "}
              {exibida.arquivoNome} em {quando(exibida.criadoEm)}
              {exibida.criadoPor ? ` por ${exibida.criadoPor}` : ""}
            </p>
          )}
          {relatorio ? <Relatorio markdown={relatorio} /> : <p className="text-sm text-slate-500">Abrindo o .zip e lendo os arquivos…</p>}
          {fase === "conferindo" && <p className="mt-4 animate-pulse text-sm text-slate-500">Escrevendo o relatório…</p>}

          {pronto && exibida && exibida.relatorio && (
            <div className="mt-6 border-t border-slate-200 pt-4">
              <a href={`/financeiro/relatorio?id=${exibida.id}`} target="_blank" rel="noreferrer" className={`${BOTAO} inline-block border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                Gerar relatório (PDF)
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
