import { createSign } from "node:crypto";

// Acesso ao Google Drive por uma conta de serviço do Google Cloud (GOOGLE_SERVICE_ACCOUNT_JSON, o arquivo .json da
// chave inteiro, numa variável secreta). As pastas do Bruno são compartilhadas com o e-mail dessa conta como
// Editor; o sistema só enxerga o que foi compartilhado com ela.

type Credencial = { client_email: string; private_key: string };
const API = "https://www.googleapis.com/drive/v3";
const PASTA = "application/vnd.google-apps.folder";

function credencial(): Credencial | null {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!bruto) return null;
  try {
    const c = JSON.parse(bruto) as Credencial;
    return c.client_email && c.private_key ? c : null;
  } catch {
    return null;
  }
}

export const driveConfigurado = () => credencial() !== null;
export const emailDaContaDeServico = () => credencial()?.client_email ?? null;

// Aceita o link da pasta (https://drive.google.com/drive/folders/<id>) ou só o id.
export function idDaPasta(texto: string | null | undefined) {
  const t = (texto ?? "").trim();
  return t.match(/folders\/([\w-]+)/)?.[1] ?? t.match(/[?&]id=([\w-]+)/)?.[1] ?? (/^[\w-]{10,}$/.test(t) ? t : null);
}

let token: { valor: string; expira: number } | null = null;
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// Token de acesso pelo fluxo JWT da conta de serviço (vale 1 hora; reaproveitado enquanto valer).
async function tokenDeAcesso() {
  if (token && token.expira > Date.now() + 60_000) return token.valor;
  const c = credencial();
  if (!c) throw new Error("Google Drive não configurado (GOOGLE_SERVICE_ACCOUNT_JSON).");
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: c.client_email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 })
  )}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(c.private_key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${corpo}.${b64url(assinatura)}` }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!j.access_token) throw new Error(`Google recusou o acesso: ${j.error_description ?? r.status}`);
  token = { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.valor;
}

async function drive(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { Authorization: `Bearer ${await tokenDeAcesso()}`, ...(init.headers ?? {}) } });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(r.status === 404 ? "Pasta ou arquivo não encontrado (confira se foi compartilhado com a conta do sistema)." : `Google Drive: ${j?.error?.message ?? r.status}`);
  }
  return r;
}
const TODAS = "supportsAllDrives=true&includeItemsFromAllDrives=true";
const aspas = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export type ArquivoDrive = { id: string; name: string; modifiedTime: string; size?: string };

export async function nomeDaPasta(id: string) {
  const r = await drive(`/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`);
  const j = (await r.json()) as { name: string; mimeType: string };
  if (j.mimeType !== PASTA) throw new Error("O link não é de uma pasta.");
  return j.name;
}

// PDFs soltos na pasta (não entra em subpastas).
export async function listarPdfs(pastaId: string) {
  const q = encodeURIComponent(`'${aspas(pastaId)}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const saida: ArquivoDrive[] = [];
  let pagina = "";
  do {
    const r = await drive(`/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime,size)&orderBy=createdTime&pageSize=100&${TODAS}${pagina ? `&pageToken=${pagina}` : ""}`);
    const j = (await r.json()) as { files: ArquivoDrive[]; nextPageToken?: string };
    saida.push(...j.files);
    pagina = j.nextPageToken ?? "";
  } while (pagina);
  return saida;
}

export async function baixar(id: string) {
  return (await drive(`/files/${id}?alt=media&supportsAllDrives=true`)).arrayBuffer();
}

// Subpasta com esse nome dentro de "pai"; cria se não existir.
export async function pastaFilha(paiId: string, nome: string) {
  const q = encodeURIComponent(`'${aspas(paiId)}' in parents and trashed = false and mimeType = '${PASTA}' and name = '${aspas(nome)}'`);
  const r = await drive(`/files?q=${q}&fields=files(id)&${TODAS}`);
  const achada = ((await r.json()) as { files: { id: string }[] }).files[0];
  if (achada) return achada.id;
  const criada = await drive(`/files?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [paiId] }),
  });
  return ((await criada.json()) as { id: string }).id;
}

// Move o arquivo de uma pasta para outra, já com o nome novo.
export async function moverRenomear(id: string, deId: string, paraId: string, nome: string) {
  await drive(`/files/${id}?addParents=${paraId}&removeParents=${deId}&fields=id&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome }),
  });
}
