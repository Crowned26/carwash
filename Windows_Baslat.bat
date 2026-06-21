@echo off
title WashTrack
color 0B

echo ===================================================
echo        WASHTRACK SISTEMI BASLATILIYOR...
echo ===================================================
echo.

:: Flask ve diger kütüphanelerin yüklü olup olmadigini kontrol et
echo Gerekli altyapi kontrol ediliyor...
pip install flask >nul 2>&1

:: Tarayicida otomatik olarak programi ac
echo Program tarayicida aciliyor...
timeout /t 2 >nul
start http://127.0.0.1:5000

:: Python sunucusunu baslat
echo Sistemin calismasi icin bu siyah ekrani KAPATMAYINIZ!
echo.
python app.py

pause
