@echo off
setlocal
rem Run from an x64 Visual Studio Developer Command Prompt.
rem Output remains a separately replaceable helper; do not link it into Veyra.
if "%~1"=="" (
  echo Usage: build.cmd ABSOLUTE_OUTPUT_EXE
  exit /b 1
)
pushd "%~dp0"
cl.exe /nologo /O2 /MT /DUNICODE /D_UNICODE /W3 /Fe:"%~1" /Fo:"%~1.obj" main.c shell32.lib /link /INCREMENTAL:NO
set RESULT=%ERRORLEVEL%
popd
exit /b %RESULT%
