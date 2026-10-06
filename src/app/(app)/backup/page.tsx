import { exigirModulo } from "@/lib/auth";
import { MANTER, PASTA_BACKUPS } from "@/lib/backup";
import { createAdminClient } from "@/lib/supabase/admin";
import { fazerBackup, liberarSistema } from "./actions";
import { BotaoBackup, BotaoLiberar } from "./BotaoBackup";

// O backup (e a ação que ele chama) pode levar alguns minutos.
export const maxDuration = 300;

// Backup do sistema (só administrador): um .zip com o código-fonte, os dados em Excel e o banco
// (schema + CSV). Enquanto roda, o sistema fica em manutenção e só o administrador acessa.
export default async function BackupPage() {
  await exigirModulo("adm");
  const db = createAdminClient();
  const [{ data: estado }, { data: guardados }] = await Promise.all([
    db ? db.from("sistema_estado").select("*").eq("id", 1).maybeSingle() : Promise.resolve({ data: null }),
    db ? db.storage.from(PASTA_BACKUPS).list("", { limit: 100 }) : Promise.resolve({ data: [] }),
  ]);
  const pacotes = (guardados ?? []).filter((a) => a.name.endsWith(".zip")).sort((a, b) => b.name.localeCompare(a.name));
  const links = await Promise.all(
    pacotes.map(async (p) => ({
      nome: p.name,
      tamanho: Number(p.metadata?.size ?? 0),
      url: db ? (await db.storage.from(PASTA_BACKUPS).createSignedUrl(p.name, 60 * 60, { download: p.name })).data?.signedUrl : undefined,
    }))
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Backup</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gera um .zip com o código-fonte, todas as tabelas em Excel e o banco de dados (schema para criar um banco novo e
          um CSV por tabela). Enquanto o backup roda, o sistema fica em manutenção: só você acessa e lança.
        </p>
      </div>

      {estado?.manutencao && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>O sistema está em manutenção ({estado.motivo ?? "sem motivo"}). Se nenhum backup estiver rodando, libere:</span>
          <BotaoLiberar liberar={liberarSistema} />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <BotaoBackup fazer={fazerBackup} />
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>
            <strong>codigo-fonte/</strong>: o projeto inteiro, baixado do GitHub.
          </li>
          <li>
            <strong>dados-excel/</strong>: todas as tabelas, uma aba por tabela. Passagens e Gympass entram pelos resumos por
            dia e por hora (as linhas brutas voltam reimportando os Excel originais).
          </li>
          <li>
            <strong>banco-de-dados/</strong>: schema-completo.sql (cria o banco do zero) e um CSV por tabela.
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Últimos backups guardados no sistema</h2>
        <p className="mb-2 text-xs text-slate-500">Ficam só os {MANTER} mais recentes; ao fazer um novo, o mais antigo é apagado.</p>
        {links.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum backup feito ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {links.map((l) => (
              <li key={l.nome} className="flex items-center justify-between gap-3 py-2">
                <span>{l.nome.replace(/\.zip$/, "")}</span>
                <span className="flex items-center gap-3 text-slate-500">
                  {(l.tamanho / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB
                  {l.url && (
                    <a href={l.url} className="font-medium text-marca underline">
                      Baixar
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
