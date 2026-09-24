-- Inventário de máquinas: sai "Braços" (estava zerado em todas as academias) e entram "Cardio" e
-- "Bancos e Abdômen".

alter table academias drop column if exists maquinas_bracos;
alter table academias add column if not exists maquinas_cardio integer not null default 0 check (maquinas_cardio >= 0);
alter table academias add column if not exists maquinas_bancos_abdomen integer not null default 0
  check (maquinas_bancos_abdomen >= 0);
