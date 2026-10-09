-- Folgas pedidas da escala gravadas: toda geração (pela tela ou a automática) respeita as folgas do período,
-- e refazer a escala não perde as que já foram informadas.
create table if not exists escala_folgas (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete cascade,
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  data date not null,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (funcionario_id, data)
);
create index if not exists escala_folgas_academia on escala_folgas (academia_id, data);

alter table escala_folgas enable row level security;
drop policy if exists "escala_folgas_acesso" on escala_folgas;
create policy "escala_folgas_acesso" on escala_folgas for all to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()))
  with check ((select is_admin()) or academia_id = (select minha_academia()));
drop policy if exists "manutencao_bloqueia" on escala_folgas;
create policy "manutencao_bloqueia" on escala_folgas as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));
