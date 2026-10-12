"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { fecharFolha, reabrirFolha } from "./actions";
import { Relatorio } from "./Relatorio";

// Conferência da folha de uma academia no mês: envia os arquivos (folha, ponto e vale-transporte), mostra o
// relatório enquanto o Claude escreve e, no fim, gera o PDF e fecha a folha (o registro do que foi aprovado).

export type ConferenciaAtual = {
  id: string;
  status: "processando" | "conferida" | "fechada" | "erro";
  relatorio: string | null;
  criadoEm: string;
  criadoPor: string;
  fechadaEm: string | null;
  fechadaPor: string;
  // processando há muito tempo: a conferência foi interrompida (o relatório pode estar incompleto).
  interrompida: boolean;
};

const ARQUIVOS = [
  { tipo: "folha", rotulo: "Folha de pagamento", obrigatorio: true },
  { tipo: "ponto", rotulo: "Relatório de ponto", obrigatorio: false },
  { tipo: "vt", rotulo: "Controle de vale-transporte", obrigatorio: false },
] as const;
const EXTENSOES = [".pdf", ".xlsx", ".xlsm", ".csv", ".png", ".jpg", ".jpeg"];
const LIMITE_MB = 30;

const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const BOTAO = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";

export function ConferenciaFolha({
  academiaId,
  mes,
  mesTexto,
  atual,
  podeReabrir,
  chaveConfigurada,
}: {
  academiaId: string;
  mes: string;
  mesTexto: string;
  atual: ConferenciaAtual | null;
  podeReabrir: boolean;
  chaveConfigurada: boolean;
}) {
  const router = useRouter();
  const campos = useRef<Record<string, HTMLInputElement | null>>({});
  const [escolhidos, setEscolhidos] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<"parado" | "enviando" | "conferindo">("parado");
  const [texto, setTexto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ erro?: string; ok?: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const fechada = atual?.status === "fechada";
  const ocupado = fase !== "parado" || salvando;

  async function conferir() {
    const folha = campos.current.folha?.files?.[0];
    if (!folha) {
      setMensagem({ erro: "Escolha pelo menos o arquivo da folha de pagamento." });
      return;
    }
    const escolhidosAgora = ARQUIVOS.map((a) => ({ tipo: a.tipo, arquivo: campos.current[a.tipo]?.files?.[0] })).filter(
      (a): a is { tipo: (typeof ARQUIVOS)[number]["tipo"]; arquivo: File } => Boolean(a.arquivo)
    );
    for (const { arquivo } of escolhidosAgora) {
      if (!EXTENSOES.some((e) => arquivo.name.toLowerCase().endsWith(e))) {
        setMensagem({ erro: `${arquivo.name}: envie PDF, Excel (.xlsx), CSV ou imagem.` });
        return;
      }
      if (arquivo.size > LIMITE_MB * 1024 * 1024) {
        setMensagem({ erro: `${arquivo.name}: arquivo muito grande (máximo ${LIMITE_MB} MB).` });
        return;
      }
    }
    setMensagem(null);
    setTexto("");
    setFase("enviando");
    try {
      // Os arquivos vão direto para a pasta da academia no armazenamento (só o módulo RH lê).
      const supabase = createClient();
      const enviados: { tipo: string; nome: string; caminho: string }[] = [];
      for (const { tipo, arquivo } of escolhidosAgora) {
        const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "pdf";
        const caminho = `${academiaId}/${mes}/${Date.now()}-${tipo}.${ext}`;
        const { error } = await supabase.storage.from("folha").upload(caminho, arquivo, { contentType: arquivo.type || undefined });
        if (error) throw new Error(`Não foi possível enviar ${arquivo.name}: ${error.message}`);
        enviados.push({ tipo, nome: arquivo.name, caminho });
      }

      setFase("conferindo");
      const resposta = await fetch("/rh/folha/conferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academia: academiaId, mes, arquivos: enviados }),
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
      setMensagem({ ok: "Conferência concluída. Confira o relatório antes de fechar a folha." });
      for (const a of ARQUIVOS) if (campos.current[a.tipo]) campos.current[a.tipo]!.value = "";
      setEscolhidos({});
    } catch (e) {
      setMensagem({ erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setFase("parado");
      // Recarrega a conferência gravada; o texto recebido some só quando ela chega (sem piscar a tela).
      iniciar(() => {
        router.refresh();
        setTexto(null);
      });
    }
  }

  function fechar() {
    if (!atual) return;
    if (!window.confirm(`Fechar a folha de ${mesTexto}? O relatório desta conferência fica registrado como aprovado e o mês fica travado.`)) return;
    iniciar(async () => {
      setMensagem(await fecharFolha(atual.id));
    });
  }

  function reabrir() {
    if (!atual || !window.confirm(`Reabrir a folha de ${mesTexto}? A reabertura fica registrada no histórico.`)) return;
    iniciar(async () => setMensagem(await reabrirFolha(atual.id)));
  }

  // Na tela: o relatório que está chegando ou o da última conferência do mês.
  const relatorio = texto ?? atual?.relatorio ?? null;
  const pronto = texto === null && atual && (atual.status === "conferida" || atual.status === "fechada" || atual.status === "erro" || atual.interrompida);

  return (
    <div className="space-y-4">
      {!chaveConfigurada && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A conferência ainda não está ativa: falta configurar a chave da API da Anthropic (ANTHROPIC_API_KEY) no servidor.
        </p>
      )}

      {fechada ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-900">
            <strong>Folha fechada</strong>
            {atual?.fechadaEm ? ` em ${quando(atual.fechadaEm)}` : ""}
            {atual?.fechadaPor ? ` por ${atual.fechadaPor}` : ""}. Este é o registro do que foi aprovado em {mesTexto}.
          </p>
          {podeReabrir && (
            <button type="button" onClick={reabrir} disabled={ocupado} className={`${BOTAO} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
              Reabrir folha
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm text-slate-600">
            Envie os arquivos de {mesTexto} (PDF, Excel ou imagem). Só a folha é obrigatória; o que faltar aparece como
            pendência no relatório.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {ARQUIVOS.map((a) => (
              <label key={a.tipo} className="block text-sm">
                <span className="font-medium text-slate-700">
                  {a.rotulo}
                  {a.obrigatorio && <span className="text-red-500"> *</span>}
                </span>
                <input
                  ref={(el) => {
                    campos.current[a.tipo] = el;
                  }}
                  type="file"
                  accept={EXTENSOES.join(",")}
                  disabled={ocupado}
                  onChange={(e) => setEscolhidos({ ...escolhidos, [a.tipo]: e.target.files?.[0]?.name ?? "" })}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={conferir}
              disabled={ocupado || !chaveConfigurada || !escolhidos.folha}
              className={`${BOTAO} bg-marca text-white hover:bg-marca-escuro`}
            >
              {fase === "enviando" ? "Enviando arquivos…" : fase === "conferindo" ? "Conferindo…" : "Conferir folha"}
            </button>
            {fase === "conferindo" && (
              <span className="text-xs text-slate-500">A conferência leva de 5 a 10 minutos. Mantenha esta página aberta.</span>
            )}
          </div>
        </div>
      )}

      {mensagem?.erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{mensagem.erro}</p>}
      {mensagem?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensagem.ok}</p>}

      {relatorio !== null && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          {atual && texto === null && (
            <p className="mb-4 text-xs text-slate-500">
              {atual.status === "erro" || atual.interrompida ? "Conferência incompleta" : "Conferência"} de {quando(atual.criadoEm)}
              {atual.criadoPor ? ` por ${atual.criadoPor}` : ""}
            </p>
          )}
          {relatorio ? <Relatorio markdown={relatorio} /> : <p className="text-sm text-slate-500">Lendo os arquivos e conferindo…</p>}
          {fase === "conferindo" && <p className="mt-4 animate-pulse text-sm text-slate-500">Escrevendo o relatório…</p>}

          {pronto && atual && (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
              <a
                href={`/rh/folha/relatorio?id=${atual.id}`}
                target="_blank"
                rel="noreferrer"
                className={`${BOTAO} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
              >
                Gerar relatório (PDF)
              </a>
              <a
                href={`/rh/folha/planilha?academia=${academiaId}&mes=${mes}`}
                target="_blank"
                rel="noreferrer"
                className={`${BOTAO} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
              >
                Planilha de coletivas (PDF)
              </a>
              {atual.status === "conferida" && (
                <button type="button" onClick={fechar} disabled={ocupado} className={`${BOTAO} bg-emerald-600 text-white hover:bg-emerald-700`}>
                  Fechar a folha
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
