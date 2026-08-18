@echo off
title Frontend (Rsbuild)
cd /d "D:\GitHub\fika"
echo.
echo ============================================================
echo   Frontend (Rsbuild)
echo ============================================================
echo Manual command: bun run dev
echo.
bun run dev
echo.
if exist "D:\GitHub\fika\.1dx\exit.flag" exit /b 0
echo Process exited. Waiting for monitor shutdown...
powershell -NoProfile -Command "try{$c=[IO.Pipes.NamedPipeClientStream]::new('.','1dx-exit-12as9xo','In');$c.Connect(60000);$c.ReadByte()|Out-Null;$c.Close()}catch{}"
exit /b 0
