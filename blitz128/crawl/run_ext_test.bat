@echo off
cd /d "%~dp0"
"D:\emu\GTK3VICE-3.9-win64\bin\x128.exe" -drive8type 1581 -drive9type 1581 -8 "%~dp0work8.d81" -9 "%~dp0work9.d81" -moncommands "%~dp0ext.mon"
