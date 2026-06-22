import os
import re
import shutil

HEIF_REGISTERED = False

PLATE_PATTERNS = [
    re.compile(r'\b(\d{2})\s+([A-Z]{2,3})\s+(\d{2,4})\b', re.IGNORECASE),
    re.compile(r'\b(\d{2})\s+([A-Z])\s+(\d{4})\b', re.IGNORECASE),
]
SKIP_LINE = re.compile(
    r'toplam|nakit\s*top|kart\s*top|ciro|gider|masraf|maa[sş]|prim|bah[sş]|kasa|kalan|'
    r'haziran|pazartesi|sali|çar[sş]|per[sş]|cuma|cumartesi|pazar|filtre|sat[iı]ld|'
    r'sıvı|sivi|defter|tarih|tl\b',
    re.IGNORECASE,
)
PM_RULES = [
    (r'nakit|nkt', 'nakit'),
    (r'\bkk\b|kart|k\.?\s*k', 'kk'),
    (r'havale|eft', 'havale'),
    (r'sonra|bekl|borç|borc', 'bekliyor'),
]
TESS_CONFIG = r'--oem 3 --psm 6 -c preserve_interword_spaces=1'


def register_heif():
    global HEIF_REGISTERED
    if HEIF_REGISTERED:
        return
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        HEIF_REGISTERED = True
    except ImportError:
        pass


def ocr_available():
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return bool(shutil.which('tesseract'))


def _normalize_line(line):
    line = line.upper()
    for a, b in (('İ', 'I'), ('Ş', 'S'), ('Ğ', 'G'), ('Ü', 'U'), ('Ö', 'O'), ('Ç', 'C')):
        line = line.replace(a, b)
    line = re.sub(r'^[0-9]+[\.\)\-]\s*', '', line.strip())
    line = re.sub(r'\s+', ' ', line)
    return line


def _format_plate(m):
    return f"{m.group(1)} {m.group(2).upper()} {m.group(3)}"


def _find_plate(line):
    for pat in PLATE_PATTERNS:
        m = pat.search(line)
        if m:
            return m
    return None


def _parse_payment(line):
    low = line.lower()
    for pat, pm in PM_RULES:
        if re.search(pat, low):
            return pm
    return 'nakit'


def _parse_wash_type(line):
    low = line.lower()
    if re.search(r'\+\s*motor|\bmotor\s*y', low) and 'mazot' not in low:
        return 'Motor Yıkama'
    if 'ic' in low and 'dis' in low:
        return 'İç-Dış Yıkama'
    if 'detay' in low:
        return 'Detaylı Temizlik'
    return 'İç-Dış Yıkama'


def _parse_price(line, plate_match):
    tail = line[plate_match.end():]
    candidates = []
    for n in re.findall(r'(\d{3,4})\+?', tail):
        v = int(n)
        if v >= 200 and n not in plate_match.group(3):
            candidates.append(v)
    if candidates:
        return float(candidates[-1])
    for n in re.findall(r'(\d{3,4})\+?', line):
        v = int(n)
        if v >= 200 and n not in plate_match.group(0):
            candidates.append(v)
    return float(candidates[-1]) if candidates else 0


def parse_ocr_text(text):
    rows = []
    seen = set()
    for raw in text.splitlines():
        line = _normalize_line(raw)
        if len(line) < 7 or SKIP_LINE.search(line):
            continue
        m = _find_plate(line)
        if not m:
            continue
        plate = _format_plate(m)
        if plate in seen:
            continue
        price = _parse_price(line, m)
        if price < 200:
            continue
        rows.append({
            'plate': plate,
            'price': price,
            'payment_method': _parse_payment(line),
            'wash_type': _parse_wash_type(raw),
            'vehicle_category': 'otomobil',
        })
        seen.add(plate)
    return rows


def normalize_image_file(filepath):
    register_heif()
    ext = filepath.rsplit('.', 1)[-1].lower() if '.' in filepath else ''
    if ext not in ('heic', 'heif'):
        return filepath, os.path.basename(filepath)
    try:
        from PIL import Image
        jpg_path = filepath.rsplit('.', 1)[0] + '.jpg'
        with Image.open(filepath) as img:
            img.convert('RGB').save(jpg_path, 'JPEG', quality=92)
        os.remove(filepath)
        return jpg_path, os.path.basename(jpg_path)
    except Exception as e:
        return None, f'HEIC dosyası dönüştürülemedi: {e}'


def _preprocess(img):
    from PIL import ImageOps, ImageEnhance, ImageFilter
    if max(img.size) < 2400:
        scale = min(2.0, 2400 / max(img.size))
        if scale > 1.05:
            img = img.resize((int(img.width * scale), int(img.height * scale)))
    elif max(img.size) > 3200:
        img.thumbnail((3200, 3200))
    img = ImageOps.autocontrast(img.convert('L'))
    img = ImageEnhance.Contrast(img).enhance(1.8)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def run_ocr(image_path):
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return '', 'OCR kütüphanesi yüklü değil (Pillow/pytesseract).'

    if not ocr_available():
        return '', 'Tesseract kurulu değil'

    register_heif()
    try:
        with Image.open(image_path) as raw:
            img = _preprocess(raw)
        text = ''
        for lang in ('tur+eng', 'eng', 'tur'):
            try:
                text = pytesseract.image_to_string(img, lang=lang, config=TESS_CONFIG)
                if text.strip():
                    break
            except Exception:
                continue
        if not text.strip():
            text = pytesseract.image_to_string(img, config=TESS_CONFIG)
        return text, None
    except Exception as e:
        return '', f'OCR okunamadı: {e}'
