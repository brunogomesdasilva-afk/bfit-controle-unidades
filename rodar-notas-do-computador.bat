@echo off
rem Robo das notas fiscais com pastas do computador (Administrador > Notas do Drive). Ver scripts\notas-locais.mts.
rem Agendado no Windows, rode com qualquer parametro (ex.: rodar-notas-do-computador.bat auto) para nao esperar tecla no fim.
cd /d "%~dp0"
call npx --yes tsx scripts\notas-locais.mts
if "%1"=="" pause
