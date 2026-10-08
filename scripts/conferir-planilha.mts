// Verificação automática dos totais das planilhas do lote (a mesma do botão "Conferir pagamentos"), para o robô
// validar-pagamentos do Claude Code. Uso: npx tsx scripts/conferir-planilha.mts "<arquivo.xlsx>" ["<outro.xlsx>"...]
import fs from "node:fs";
import path from "node:path";
import { conferirPlanilha } from "../src/lib/conferirPlanilha";

for (const arquivo of process.argv.slice(2)) {
  const dados = fs.readFileSync(arquivo);
  console.log(`# ${path.basename(arquivo)}`);
  for (const achado of await conferirPlanilha(dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.length), path.basename(arquivo))) console.log(`- ${achado}`);
}
