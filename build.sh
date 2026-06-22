#!/usr/bin/env bash
set -euo pipefail
pip install -r requirements.txt
if ! command -v tesseract >/dev/null 2>&1; then
  echo "ERROR: tesseract not found — check apt.txt"
  exit 1
fi
tesseract --version
echo "Build OK: tesseract + python deps ready"
