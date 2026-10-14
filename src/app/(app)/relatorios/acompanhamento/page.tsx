import { exigirAdmin } from "@/lib/auth";
import { nomeDoCanal } from "@/lib/notificar";
import { ontem } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { BotaoEnviarEmail } from "../pendencias/BotaoEnviarEmail";
import { enviarAgora } from "./actions";

export const maxDuration = 300;

// Acompanhamento diário (só administrador): todo dia às 8h cada unidade recebe por e-mail o Painel do dia
// anterior em PDF (usuários da unidade e administradores). Aqui dá para ver o PDF e enviar na hora.
export default async function AcompanhamentoPage() {
  await exigirAdmin();
  const supabase = await createClient();
  const { data: academias } = await supabase.from("academias").select("id, nome").order("nome");
  const referencia = ontem();
  const cronConfigurado = Boolean(process.env.CRON_SECRET);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">BFIT · Relatórios</p>
        <h1 className="text-lg font-semibold text-slate-900">Acompanhamento diário</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo dia às 8h, cada unidade recebe por {nomeDoCanal()} o Painel do dia anterior em PDF: vão para os usuários da unidade e
          para os administradores.
        </p>
      </div>
      <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
        Em teste: o envio automático das 8h está indo só para os administradores. Os gerentes passam a receber quando o
        Bruno liberar.
      </p>
      {!cronConfigurado && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          O envio automático ainda não está ativo: falta a variável CRON_SECRET na Vercel.
        </p>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">PDF de {referencia.split("-").reverse().join("/")}</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {(academias ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <span>{a.nome}</span>
              <a href={`/relatorios/acompanhamento/pdf?academia=${a.id}`} target="_blank" rel="noreferrer" className="font-medium text-marca underline">
                Abrir PDF
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <BotaoEnviarEmail
          enviar={enviarAgora.bind(null, true)}
          rotulo="Enviar agora só para mim (teste)"
          confirmacao="Enviar agora o acompanhamento de todas as unidades só para os administradores?"
        />
        <BotaoEnviarEmail
          enviar={enviarAgora.bind(null, false)}
          rotulo="Enviar agora para todos"
          confirmacao="Enviar agora o acompanhamento de cada unidade para os usuários dela e os administradores?"
        />
      </div>
    </div>
  );
}
