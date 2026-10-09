// Correção única: junta na grade as aulas iguais em sequência (ex.: FIT DANCE 20:00 e 20:30 de 30 min viram
// 20:00 com 60 min) e acerta as contagens já lançadas em dobro: fica uma contagem no horário da aula (a de
// maior quantidade); a do segundo bloco é apagada ou, se for a única do dia, passa para o horário da aula.
// Uso: npx tsx scripts/juntar-aulas-seguidas.mts [--gravar]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { juntarSequencias } from "../src/lib/aulasSeguidas";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const gravar = process.argv.includes("--gravar");

type Aula = { id: string; academia_id: string; tipo: string; dia_semana: number; horario: string; modalidade: string; professor: string | null; duracao_min: number; vigente_de: string; vigente_ate: string | null };
const { data: grade } = await db.from("grade_aulas").select("id, academia_id, tipo, dia_semana, horario, modalidade, professor, duracao_min, vigente_de, vigente_ate");
const versoes = new Map<string, Aula[]>();
for (const a of (grade ?? []) as Aula[]) {
  const k = `${a.academia_id}|${a.tipo}|${a.vigente_de}|${a.vigente_ate ?? ""}`;
  versoes.set(k, [...(versoes.get(k) ?? []), { ...a, horario: a.horario.slice(0, 5) }]);
}
const diaIso = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
let aulasJuntadas = 0;
let contagensApagadas = 0;
let contagensMovidas = 0;

for (const aulas of versoes.values()) {
  const { ficam, juntadas } = juntarSequencias(aulas);
  if (!juntadas.length) continue;
  const tabela = aulas[0].tipo === "lutas" ? "contagem_lutas" : "contagem_coletivas";
  for (const f of ficam) {
    const original = aulas.find((a) => a.id === f.id)!;
    if (f.duracao_min !== original.duracao_min) {
      console.log(`${aulas[0].tipo} dia ${f.dia_semana} ${f.horario} ${f.modalidade} (${f.professor ?? "-"}): ${original.duracao_min} → ${f.duracao_min} min`);
      if (gravar) await db.from("grade_aulas").update({ duracao_min: f.duracao_min }).eq("id", f.id);
    }
  }
  for (const { aula, em } of juntadas) {
    aulasJuntadas++;
    if (gravar) await db.from("grade_aulas").delete().eq("id", aula.id);
    // Contagens do bloco juntado, no período em que essa versão da grade valeu.
    let q = db.from(tabela).select("id, data, horario, modalidade, quantidade").eq("academia_id", aula.academia_id).eq("horario", `${aula.horario}:00`).gte("data", aula.vigente_de);
    if (aula.vigente_ate) q = q.lte("data", aula.vigente_ate);
    const { data: doBloco } = await q;
    for (const c of (doBloco ?? []).filter((c) => diaIso(c.data) === aula.dia_semana && c.modalidade?.trim().toLowerCase() === aula.modalidade.trim().toLowerCase())) {
      const { data: principal } = await db.from(tabela).select("id, quantidade").eq("academia_id", aula.academia_id).eq("data", c.data).eq("horario", `${em.horario}:00`).ilike("modalidade", aula.modalidade.trim()).maybeSingle();
      if (principal) {
        contagensApagadas++;
        if (gravar) {
          if ((c.quantidade ?? 0) > (principal.quantidade ?? 0)) await db.from(tabela).update({ quantidade: c.quantidade }).eq("id", principal.id);
          await db.from(tabela).delete().eq("id", c.id);
        }
      } else {
        contagensMovidas++;
        if (gravar) await db.from(tabela).update({ horario: `${em.horario}:00` }).eq("id", c.id);
      }
    }
  }
}
console.log(`\n${gravar ? "GRAVADO" : "SIMULAÇÃO"}: ${aulasJuntadas} blocos juntados na grade; ${contagensApagadas} contagens em dobro apagadas (ficou a maior); ${contagensMovidas} contagens passadas para o horário da aula.`);
