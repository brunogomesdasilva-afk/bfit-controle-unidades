-- Celular (WhatsApp) do usuário: preenchido, os relatórios enviados por e-mail também vão por WhatsApp.
alter table profiles add column if not exists whatsapp text;
