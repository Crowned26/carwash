#!/bin/bash
clear
echo "==================================================="
echo "       WASHTRACK SISTEMI BASLATILIYOR...     "
echo "==================================================="
echo ""

# Bulunduğu klasöre git (Taşınabilirlik için kritik)
cd "$(dirname "$0")"

# Venv klasörü yoksa oluştur ve gereksinimleri yükle
if [ ! -d "venv" ]; then
    echo "Ilk kurulum yapiliyor (Bazi gereksinimler yukleniyor)..."
    python3 -m venv venv
    source venv/bin/activate
    pip install flask
else
    source venv/bin/activate
fi

# Tarayiciyi 2 saniye sonra otomatik ac
(sleep 2 && open http://127.0.0.1:5000) &

# Start the Flask app in FOREGROUND
python3 app.py
