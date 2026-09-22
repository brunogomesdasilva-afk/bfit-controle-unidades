@echo off
title BFIT - Controle de unidades - servidor
cd /d "%~dp0"
echo.
echo  Iniciando o sistema. Em instantes ele abre em http://localhost:3001
echo  Mantenha esta janela aberta enquanto estiver usando o sistema.
echo  Para desligar, feche esta janela.
echo.
start "" /b cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:3001"
call npm run dev
pause
