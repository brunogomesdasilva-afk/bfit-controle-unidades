// O que todo provedor de WhatsApp precisa saber fazer. Para trocar de serviço, basta escrever outro provedor com esta
// forma e escolhê-lo pela variável WHATSAPP_PROVIDER (ver index.ts).

export type DocumentoWhatsapp = {
  to: string; // celular normalizado, ex.: 5511988887777
  fileBuffer?: Uint8Array; // o arquivo em memória (o normal: os PDFs são gerados na hora)
  fileUrl?: string; // ou um link público/assinado para o arquivo
  fileName: string; // nome que aparece no WhatsApp, com extensão (ex.: "Fechamento Centro 2026-10.pdf")
  caption: string; // texto que acompanha o arquivo
};

export interface ProvedorWhatsapp {
  nome: string;
  configurado(): boolean;
  sendDocument(documento: DocumentoWhatsapp): Promise<void>;
}
