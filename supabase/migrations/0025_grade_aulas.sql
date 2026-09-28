-- Grade de aulas de cada academia (coletivas e lutas): dia da semana, horário, modalidade, professor titular e
-- duração. É a base do "Fechamento coletivas": horas previstas pela grade × horas dadas pelas contagens.

create table if not exists grade_aulas (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete cascade,
  tipo text not null check (tipo in ('coletivas', 'lutas')),
  dia_semana smallint not null check (dia_semana between 1 and 7), -- 1 = segunda ... 7 = domingo
  horario time not null,
  modalidade text not null,
  professor text,
  duracao_min smallint not null default 30 check (duracao_min between 5 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists grade_aulas_unica on grade_aulas (academia_id, tipo, dia_semana, horario, lower(modalidade));

drop trigger if exists trg_grade_aulas_updated_at on grade_aulas;
create trigger trg_grade_aulas_updated_at before update on grade_aulas
  for each row execute function set_updated_at();

alter table grade_aulas enable row level security;
drop policy if exists "grade_aulas_select" on grade_aulas;
create policy "grade_aulas_select" on grade_aulas for select to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()));
drop policy if exists "grade_aulas_write" on grade_aulas;
create policy "grade_aulas_write" on grade_aulas for all to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()))
  with check ((select is_admin()) or academia_id = (select minha_academia()));
drop policy if exists "manutencao_bloqueia" on grade_aulas;
create policy "manutencao_bloqueia" on grade_aulas as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));
