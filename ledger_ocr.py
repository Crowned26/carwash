import re
import shutil

PLATE_RE = re.compile(r'\b(\d{2})\s*([A-Z]{1,3})\s*(\d{2,4})\b', re.IGNORECASE)
AMOUNT_RE = re.compile(r'(?:₺|TL)?\s*(\d{2,4})(?:[.,](\d{2}))?\s*(?:₺|TL)?', re.IGNORECASE)
PM_RULES = [
    (r'nakit|nkt|cash', 'nakit'),
    (r'\bkk\b|kart|k\.?\s*k|kredi', 'kk'),
    (r'havale|eft|wire', 'havale'),
    (r'sonra|bekl|borç|borc', 'bekliyor'),
]


def ocr_available():
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    return bool(shutil.which('tesseract'))


def _format_plate(m):
    return f"{m.group(1)} {m.group(2).upper()} {m.group(3)}"


def _parse_payment(line):
    low = line.lower()
    for pat, pm in PM_RULES:
        if re.search(pat, low):
            return pm
    return 'nakit'


def _parse_amount(line, plate_match):
    rest = line[plate_match.end():]
    for chunk in (rest, line):
        for a in AMOUNT_RE.finditer(chunk):
            whole = a.group(0)
            if any(ch in whole for ch in plate_match.group(0)):
                continue
            val = a.group(1)
            dec = a.group(2)
            price = float(f'{val}.{dec}' if dec else val)
            if price >= 50:
                return price
    nums = re.findall(r'\b(\d{2,4})\b', line.replace(plate_match.group(0), ''))
    for n in reversed(nums):
        v = float(n)
        if v >= 50 and n not in plate_match.group(3):
            return v
    return 0


def parse_ocr_text(text):
    rows = []
    seen = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if len(line) < 5:
            continue
        norm = line.upper().replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G').replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
        for m in PLATE_RE.finditer(norm):
            plate = _format_plate(m)
            if plate in seen:
                continue
            rows.append({
                'plate': plate,
                'price': _parse_amount(line, m),
                'payment_method': _parse_payment(line),
                'wash_type': 'İç-Dış Yıkama',
                'vehicle_category': 'otomobil',
            })
            seen.add(plate)
    return rows


def run_ocr(image_path):
    try:
        import pytesseract
        from PIL import Image, ImageEnhance, ImageFilter
    except ImportError:
        return '', 'OCR kütüphanesi yüklü değil (Pillow/pytesseract).'

    if not shutil.which('tesseract'):
        return '', 'Tesseract kurulu değil. Mac: brew install tesseract tesseract-lang'

    img = Image.open(image_path)
    if max(img.size) > 2000:
        img.thumbnail((2000, 2000))
    img = img.convert('L')
    img = ImageEnhance.Contrast(img).enhance(2.2)
    img = img.filter(ImageFilter.SHARPEN)

    text = ''
    for lang in ('tur+eng', 'eng', 'tur'):
        try:
            text = pytesseract.image_to_string(img, lang=lang)
            if text.strip():
                break
        except Exception:
            continue
    if not text.strip():
        try:
            text = pytesseract.image_to_string(img)
        except Exception as e:
            return '', f'OCR okunamadı: {e}'
    return text, None
