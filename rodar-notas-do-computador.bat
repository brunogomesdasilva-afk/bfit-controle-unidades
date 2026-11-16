@echo off
rem Robo das notas fiscais com pastas do computador (Administrador > Notas do Drive). Ver scripts\notas-locais.mts.
rem Agendado no Windows, rode com um parametro (ex.: rodar-notas-do-computador.bat auto): so roda com a caixa
rem "Rodar automaticamente" marcada e nao espera tecla no fim. Dois cliques (sem parametro) roda sempre.
cd /d "%~dp0"
call npx --yes tsx scripts\notas-locais.mts %*
if "%1"=="" pause
