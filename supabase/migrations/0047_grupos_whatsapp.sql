-- Cadastro de grupos de WhatsApp (menu Administrador > Cadastro): nome e ID de cada grupo, para escolher nas regras de
-- Envios automáticos sem precisar descobrir o ID de novo. O ID é o que a Z-API usa, ex.: 120363019502650977-group.
create table if not exists grupos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  grupo_id text not null unique,
  criado_em timestamptz not null default now()
);
alter table grupos_whatsapp enable row level security;
drop policy if exists "grupos_whatsapp_admin" on grupos_whatsapp;
create policy "grupos_whatsapp_admin" on grupos_whatsapp for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));
