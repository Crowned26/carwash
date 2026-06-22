from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
from functools import wraps
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import datetime
import json
import os
import shutil

import ledger_ocr

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'oto_yikama_pro_gizli_anahtar')
DB_FILE = os.environ.get('DATABASE_PATH', 'yikama.db')
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
ALLOWED_UPLOAD_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'}
INVALID_FILE_MSG = 'Geçersiz dosya tipi! (png, jpg, gif, webp, heic)'

DEFAULT_PRICES = {
    'İç-Dış Yıkama': {'otomobil': 900, 'suv': 1000},
    'İç Yıkama': {'otomobil': 500, 'suv': 600},
    'Dış Yıkama': {'otomobil': 400, 'suv': 500},
    'Motor Yıkama': {'otomobil': 300, 'suv': 350},
    'Detaylı Temizlik': {'otomobil': 1500, 'suv': 1800},
    'Pasta Cila': {'otomobil': 2000, 'suv': 2500},
}
DEFAULT_CASH_DISCOUNT = 100

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def _upload_ext(filename, mimetype=''):
    if filename and '.' in filename:
        ext = filename.rsplit('.', 1)[-1].lower()
        if ext in ALLOWED_UPLOAD_EXT:
            return ext
    mime = (mimetype or '').lower()
    for mt, ext in (
        ('image/heic', 'heic'), ('image/heif', 'heif'),
        ('image/jpeg', 'jpg'), ('image/png', 'png'),
        ('image/webp', 'webp'), ('image/gif', 'gif'),
    ):
        if mime == mt:
            return ext
    return ''


def _save_ledger_image(photo, photo_date):
    ext = _upload_ext(photo.filename, photo.content_type)
    if not ext:
        return None, None, INVALID_FILE_MSG
    safe = secure_filename(photo.filename)
    base = safe.rsplit('.', 1)[0][:20] if safe else 'photo'
    filename = f"ledger_{photo_date}_{datetime.datetime.now().strftime('%H%M%S')}_{base}.{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    photo.save(filepath)
    filepath, filename = ledger_ocr.normalize_image_file(filepath)
    if filepath is None:
        return None, None, filename
    return filepath, filename, None




def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def get_setting(key, default=''):
    conn = get_db_connection()
    row = conn.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
    conn.close()
    return row['value'] if row else default


def get_cash_discount():
    try:
        return float(get_setting('cash_discount', str(DEFAULT_CASH_DISCOUNT)))
    except (TypeError, ValueError):
        return DEFAULT_CASH_DISCOUNT


def get_admin_password():
    return get_setting('admin_password', '123')


def verify_password(stored, provided):
    if stored == '':
        return True
    if stored.startswith(('pbkdf2:', 'scrypt:')):
        return check_password_hash(stored, provided)
    return stored == provided


def hash_password(plain):
    if plain == '':
        return ''
    return generate_password_hash(plain)


def record_date(ts):
    return (ts or '').split(' ')[0]


def is_day_closed(conn, date, branch):
    return conn.execute(
        'SELECT 1 FROM closed_days WHERE date=? AND branch=?', (date, branch)
    ).fetchone() is not None


def counts_for_day_revenue(v, ts, te):
    if v['payment_method'] == 'bekliyor':
        return False
    paid_at = v.get('paid_at') or ''
    if paid_at and ts <= paid_at <= te:
        return True
    if not paid_at and ts <= v['created_at'] <= te:
        return True
    return False


def sum_revenue(vehicles, ts, te):
    cash = cc = havale = 0.0
    for v in vehicles:
        if not counts_for_day_revenue(v, ts, te):
            continue
        p = v['price']
        pm = v['payment_method']
        if pm == 'nakit':
            cash += p
        elif pm == 'kk':
            cc += p
        elif pm == 'havale':
            havale += p
    return cash, cc, havale


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if get_admin_password() == '':
            return f(*args, **kwargs)
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate TEXT NOT NULL,
            wash_type TEXT NOT NULL,
            payment_method TEXT NOT NULL,
            price REAL NOT NULL,
            brand_model TEXT DEFAULT '',
            vehicle_category TEXT DEFAULT 'otomobil',
            branch TEXT DEFAULT 'Şube 1',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT DEFAULT 'Diğer',
            branch TEXT DEFAULT 'Şube 1',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ledger_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            photo_date TEXT NOT NULL,
            branch TEXT DEFAULT 'Şube 1',
            created_at TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS closed_days (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            branch TEXT DEFAULT 'Şube 1',
            closed_at TEXT NOT NULL,
            UNIQUE(date, branch)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    ''')
    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name', 'WashTrack')")
    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', '123')")
    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('prices', ?)", (json.dumps(DEFAULT_PRICES),))
    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('cash_discount', ?)", (str(DEFAULT_CASH_DISCOUNT),))
    conn.execute('INSERT OR IGNORE INTO branches (name) VALUES (?)', ('Şube 1',))
    conn.execute('INSERT OR IGNORE INTO branches (name) VALUES (?)', ('Şube 2',))
    for col, tbl, default in [
        ('brand_model', 'vehicles', '""'), ('vehicle_category', 'vehicles', '"otomobil"'),
        ('branch', 'vehicles', '"Şube 1"'), ('paid_at', 'vehicles', 'NULL'),
        ('category', 'expenses', '"Diğer"'),
        ('branch', 'expenses', '"Şube 1"'), ('branch', 'ledger_photos', '"Şube 1"'),
    ]:
        try:
            conn.execute(f'ALTER TABLE {tbl} ADD COLUMN {col} TEXT DEFAULT {default}')
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()


init_db()


# ── Auth ──
@app.route('/login', methods=['GET', 'POST'])
def login():
    pwd = get_admin_password()
    app_name = get_setting('app_name', 'WashTrack')
    if pwd == '':
        session['logged_in'] = True
        return redirect(url_for('index'))

    if request.method == 'POST':
        password = request.form.get('password', '')
        if verify_password(pwd, password):
            session['logged_in'] = True
            if not pwd.startswith(('pbkdf2:', 'scrypt:')) and password:
                conn = get_db_connection()
                conn.execute(
                    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                    ('admin_password', hash_password(password)),
                )
                conn.commit()
                conn.close()
            return redirect(url_for('index'))
        return render_template('login.html', error='Hatalı şifre girdiniz!', app_name=app_name)
    return render_template('login.html', app_name=app_name)


@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))


# ── Pages ──
@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/stats')
@login_required
def stats_page():
    return render_template('stats.html')


@app.route('/plate_history')
@login_required
def plate_history_page():
    return render_template('plate_history.html')


# ── Settings & Branches ──
@app.route('/api/settings', methods=['GET'])
@login_required
def get_settings():
    conn = get_db_connection()
    settings = {r['key']: r['value'] for r in conn.execute('SELECT * FROM settings').fetchall()}
    branches = [r['name'] for r in conn.execute('SELECT name FROM branches ORDER BY id').fetchall()]
    conn.close()
    if 'prices' in settings:
        try:
            settings['prices'] = json.loads(settings['prices'])
        except json.JSONDecodeError:
            settings['prices'] = DEFAULT_PRICES
    else:
        settings['prices'] = DEFAULT_PRICES
    return jsonify({'settings': settings, 'branches': branches})


@app.route('/api/settings', methods=['POST'])
@login_required
def update_settings():
    data = request.json or {}
    conn = get_db_connection()
    for key, value in data.items():
        if key == 'admin_password':
            if value != '':
                value = hash_password(value)
            else:
                value = ''
        elif key == 'prices':
            value = json.dumps(value) if isinstance(value, dict) else value
        conn.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/branches', methods=['POST'])
@login_required
def add_branch():
    name = request.json.get('name', '').strip()
    if not name:
        return jsonify({'error': 'İsim gerekli!'}), 400
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO branches (name) VALUES (?)', (name,))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Bu isimde şube zaten var!'}), 400
    conn.close()
    return jsonify({'success': True})


# ── Backup & Restore ──
@app.route('/api/backup', methods=['GET'])
@login_required
def backup_db():
    try:
        return send_file(DB_FILE, as_attachment=True, download_name='yikama_backup.db')
    except Exception as e:
        return str(e), 500


@app.route('/api/restore', methods=['POST'])
@login_required
def restore_db():
    if 'file' not in request.files:
        return jsonify({'error': 'Dosya seçilmedi!'}), 400
    f = request.files['file']
    if not f.filename or not f.filename.lower().endswith('.db'):
        return jsonify({'error': 'Sadece .db dosyası yüklenebilir!'}), 400
    if os.path.exists(DB_FILE):
        shutil.copy2(DB_FILE, DB_FILE + '.bak')
    f.save(DB_FILE)
    init_db()
    return jsonify({'success': True})


# ── Stats ──
@app.route('/api/stats_data')
@login_required
def get_stats_data():
    branch = request.args.get('branch', 'Şube 1')
    conn = get_db_connection()
    all_vehicles = [dict(r) for r in conn.execute('SELECT * FROM vehicles WHERE branch=?', (branch,)).fetchall()]
    now = datetime.datetime.now()
    month_names = {1: 'Oca', 2: 'Şub', 3: 'Mar', 4: 'Nis', 5: 'May', 6: 'Haz',
                   7: 'Tem', 8: 'Ağu', 9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara'}
    labels, revenue = [], []
    for i in range(6, -1, -1):
        d = now - datetime.timedelta(days=i)
        ds = d.strftime('%Y-%m-%d')
        labels.append(f"{d.day} {month_names[d.month]}")
        ts, te = f"{ds} 00:00:00", f"{ds} 23:59:59"
        cash, cc, havale = sum_revenue(all_vehicles, ts, te)
        revenue.append(cash + cc + havale)
    ms = now.replace(day=1, hour=0, minute=0, second=0).strftime('%Y-%m-%d %H:%M:%S')
    eq = conn.execute(
        'SELECT category, SUM(amount) FROM expenses WHERE created_at>=? AND branch=? GROUP BY category',
        (ms, branch),
    ).fetchall()
    wq = conn.execute(
        'SELECT wash_type, COUNT(*) FROM vehicles WHERE created_at>=? AND branch=? GROUP BY wash_type',
        (ms, branch),
    ).fetchall()
    conn.close()
    return jsonify({
        'revenue': {'labels': labels, 'data': revenue},
        'expenses': {'labels': [r[0] for r in eq], 'data': [r[1] for r in eq]},
        'wash_types': {'labels': [r[0] for r in wq], 'data': [r[1] for r in wq]},
    })


# ── Vehicle CRUD ──
@app.route('/api/add_vehicle', methods=['POST'])
@login_required
def add_vehicle():
    d = request.json
    plate, wt, pm = d.get('plate'), d.get('wash_type'), d.get('payment_method')
    price = d.get('price')
    bm = d.get('brand_model', '')
    vc = d.get('vehicle_category', 'otomobil')
    branch = d.get('branch', 'Şube 1')
    if not all([plate, wt, pm]):
        return jsonify({'error': 'Eksik bilgi!'}), 400
    if price is None or price == '':
        return jsonify({'error': 'Fiyat gerekli!'}), 400
    now = d.get('created_at') or datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    record_date_str = record_date(now)
    conn = get_db_connection()
    if is_day_closed(conn, record_date_str, branch):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için yeni kayıt eklenemez!'}), 400
    paid_at = None if pm == 'bekliyor' else now
    conn.execute(
        'INSERT INTO vehicles (plate, wash_type, payment_method, price, created_at, brand_model, vehicle_category, branch, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (plate, wt, pm, float(price), now, bm, vc, branch, paid_at),
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/pay_vehicle/<int:id>', methods=['POST'])
@login_required
def pay_vehicle(id):
    d = request.json
    pm, price = d.get('payment_method'), d.get('price')
    if not all([pm, price]):
        return jsonify({'error': 'Eksik bilgi!'}), 400
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db_connection()
    conn.execute(
        'UPDATE vehicles SET payment_method=?, price=?, paid_at=? WHERE id=?',
        (pm, float(price), now, id),
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/edit_vehicle/<int:id>', methods=['POST'])
@login_required
def edit_vehicle(id):
    d = request.json
    plate, wt, pm = d.get('plate'), d.get('wash_type'), d.get('payment_method')
    price = d.get('price')
    bm = d.get('brand_model', '')
    vc = d.get('vehicle_category', 'otomobil')
    if not all([plate, wt, pm]):
        return jsonify({'error': 'Eksik bilgi!'}), 400
    if price is None or price == '':
        return jsonify({'error': 'Fiyat gerekli!'}), 400
    conn = get_db_connection()
    row = conn.execute('SELECT created_at, branch, payment_method FROM vehicles WHERE id=?', (id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Kayıt bulunamadı!'}), 404
    if is_day_closed(conn, record_date(row['created_at']), row['branch']):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için düzenleme yapılamaz!'}), 400
    paid_at = None
    if pm != 'bekliyor':
        paid_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S') if row['payment_method'] == 'bekliyor' else None
        if paid_at is None:
            existing = conn.execute('SELECT paid_at FROM vehicles WHERE id=?', (id,)).fetchone()
            paid_at = existing['paid_at'] if existing else None
    conn.execute(
        'UPDATE vehicles SET plate=?, wash_type=?, payment_method=?, price=?, brand_model=?, vehicle_category=?, paid_at=? WHERE id=?',
        (plate, wt, pm, float(price), bm, vc, paid_at, id),
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/delete_vehicle/<int:id>', methods=['DELETE'])
@login_required
def delete_vehicle(id):
    conn = get_db_connection()
    row = conn.execute('SELECT created_at, branch FROM vehicles WHERE id=?', (id,)).fetchone()
    if row and is_day_closed(conn, record_date(row['created_at']), row['branch']):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için silme yapılamaz!'}), 400
    conn.execute('DELETE FROM vehicles WHERE id=?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ── Expense CRUD ──
@app.route('/api/add_expense', methods=['POST'])
@login_required
def add_expense():
    d = request.json
    desc, amt = d.get('description'), d.get('amount')
    cat = d.get('category', 'Diğer')
    branch = d.get('branch', 'Şube 1')
    if not all([desc, amt]):
        return jsonify({'error': 'Eksik bilgi!'}), 400
    now = d.get('created_at') or datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    record_date_str = record_date(now)
    conn = get_db_connection()
    if is_day_closed(conn, record_date_str, branch):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için yeni kayıt eklenemez!'}), 400
    conn.execute(
        'INSERT INTO expenses (description, amount, category, branch, created_at) VALUES (?, ?, ?, ?, ?)',
        (desc, float(amt), cat, branch, now),
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/edit_expense/<int:id>', methods=['POST'])
@login_required
def edit_expense(id):
    d = request.json
    desc, amt = d.get('description'), d.get('amount')
    cat = d.get('category', 'Diğer')
    if not all([desc, amt]):
        return jsonify({'error': 'Eksik bilgi!'}), 400
    conn = get_db_connection()
    row = conn.execute('SELECT created_at, branch FROM expenses WHERE id=?', (id,)).fetchone()
    if row and is_day_closed(conn, record_date(row['created_at']), row['branch']):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için düzenleme yapılamaz!'}), 400
    conn.execute(
        'UPDATE expenses SET description=?, amount=?, category=? WHERE id=?',
        (desc, float(amt), cat, id),
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/delete_expense/<int:id>', methods=['DELETE'])
@login_required
def delete_expense(id):
    conn = get_db_connection()
    row = conn.execute('SELECT created_at, branch FROM expenses WHERE id=?', (id,)).fetchone()
    if row and is_day_closed(conn, record_date(row['created_at']), row['branch']):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için silme yapılamaz!'}), 400
    conn.execute('DELETE FROM expenses WHERE id=?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ── Plate lookup / history ──
@app.route('/api/check_plate', methods=['GET'])
@login_required
def check_plate():
    plate = request.args.get('plate', '').strip().upper()
    branch = request.args.get('branch', 'Şube 1')
    target_date = request.args.get('date', datetime.datetime.now().strftime('%Y-%m-%d'))
    if not plate:
        return jsonify({'count': 0, 'today_count': 0, 'last': None})
    conn = get_db_connection()
    count = conn.execute(
        'SELECT COUNT(*) FROM vehicles WHERE plate=? AND branch=?', (plate, branch)
    ).fetchone()[0]
    ts, te = f"{target_date} 00:00:00", f"{target_date} 23:59:59"
    today_count = conn.execute(
        'SELECT COUNT(*) FROM vehicles WHERE plate=? AND branch=? AND created_at>=? AND created_at<=?',
        (plate, branch, ts, te),
    ).fetchone()[0]
    last_row = conn.execute(
        '''SELECT brand_model, vehicle_category, wash_type, payment_method
           FROM vehicles WHERE plate=? AND branch=? ORDER BY id DESC LIMIT 1''',
        (plate, branch),
    ).fetchone()
    conn.close()
    return jsonify({
        'count': count,
        'today_count': today_count,
        'last': dict(last_row) if last_row else None,
    })


@app.route('/api/plate_suggest', methods=['GET'])
@login_required
def plate_suggest():
    q = request.args.get('q', '').strip().upper().replace(' ', '')
    branch = request.args.get('branch', 'Şube 1')
    if len(q) < 2:
        return jsonify({'plates': []})
    conn = get_db_connection()
    rows = conn.execute(
        '''SELECT plate, MAX(id) as mid FROM vehicles
           WHERE branch=? AND REPLACE(plate, ' ', '') LIKE ?
           GROUP BY plate ORDER BY mid DESC LIMIT 10''',
        (branch, f'%{q}%'),
    ).fetchall()
    conn.close()
    return jsonify({'plates': [r['plate'] for r in rows]})


@app.route('/api/recent_plates', methods=['GET'])
@login_required
def recent_plates():
    branch = request.args.get('branch', 'Şube 1')
    limit = min(int(request.args.get('limit', 8)), 12)
    conn = get_db_connection()
    rows = conn.execute(
        '''SELECT plate, brand_model FROM vehicles
           WHERE branch=? GROUP BY plate ORDER BY MAX(id) DESC LIMIT ?''',
        (branch, limit),
    ).fetchall()
    conn.close()
    return jsonify({'plates': [dict(r) for r in rows]})


@app.route('/api/plate_history', methods=['GET'])
@login_required
def plate_history_data():
    plate = request.args.get('plate', '').strip().upper()
    branch = request.args.get('branch', 'Şube 1')
    if not plate:
        return jsonify({'vehicles': [], 'summary': {'total_visits': 0, 'total_spent': 0, 'pending_debt': 0}})
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT * FROM vehicles WHERE plate=? AND branch=? ORDER BY created_at DESC',
        (plate, branch),
    ).fetchall()
    vehicles = [dict(r) for r in rows]
    total_spent = sum(v['price'] for v in vehicles if v['payment_method'] != 'bekliyor')
    pending = sum(v['price'] for v in vehicles if v['payment_method'] == 'bekliyor')
    last = vehicles[0] if vehicles else None
    conn.close()
    return jsonify({
        'vehicles': vehicles,
        'summary': {
            'total_visits': len(vehicles),
            'total_spent': total_spent,
            'pending_debt': pending,
            'brand_model': last.get('brand_model', '') if last else '',
            'vehicle_category': last.get('vehicle_category', '') if last else '',
        },
    })


# ── Ledger photos ──
@app.route('/api/upload_ledger', methods=['POST'])
@login_required
def upload_ledger():
    if 'photo' not in request.files:
        return jsonify({'error': 'Fotoğraf yüklenmedi!'}), 400
    photo = request.files['photo']
    if photo.filename == '':
        return jsonify({'error': 'Dosya seçilmedi!'}), 400
    ext = _upload_ext(photo.filename, photo.content_type)
    if not ext:
        return jsonify({'error': INVALID_FILE_MSG}), 400
    photo_date = request.form.get('photo_date', datetime.datetime.now().strftime('%Y-%m-%d'))
    branch = request.form.get('branch', 'Şube 1')
    filepath, filename, err = _save_ledger_image(photo, photo_date)
    if err:
        return jsonify({'error': err}), 400
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO ledger_photos (filename, photo_date, branch, created_at) VALUES (?, ?, ?, ?)',
        (filename, photo_date, branch, now),
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'filename': filename})


@app.route('/api/get_ledger_photos', methods=['GET'])
@login_required
def get_ledger_photos():
    photo_date = request.args.get('date', datetime.datetime.now().strftime('%Y-%m-%d'))
    branch = request.args.get('branch', 'Şube 1')
    conn = get_db_connection()
    photos = conn.execute(
        'SELECT * FROM ledger_photos WHERE photo_date=? AND branch=? ORDER BY created_at DESC',
        (photo_date, branch),
    ).fetchall()
    conn.close()
    return jsonify({'photos': [dict(p) for p in photos]})


@app.route('/api/delete_ledger/<int:id>', methods=['DELETE'])
@login_required
def delete_ledger(id):
    conn = get_db_connection()
    photo = conn.execute('SELECT filename FROM ledger_photos WHERE id=?', (id,)).fetchone()
    if photo:
        fp = os.path.join(UPLOAD_FOLDER, photo['filename'])
        if os.path.exists(fp):
            os.remove(fp)
        conn.execute('DELETE FROM ledger_photos WHERE id=?', (id,))
        conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/scan_ledger', methods=['POST'])
@login_required
def scan_ledger():
    if 'photo' not in request.files:
        return jsonify({'error': 'Fotoğraf yüklenmedi!'}), 400
    photo = request.files['photo']
    if photo.filename == '':
        return jsonify({'error': 'Dosya seçilmedi!'}), 400
    ext = _upload_ext(photo.filename, photo.content_type)
    if not ext:
        return jsonify({'error': INVALID_FILE_MSG}), 400

    photo_date = request.form.get('photo_date', datetime.datetime.now().strftime('%Y-%m-%d'))
    branch = request.form.get('branch', 'Şube 1')
    filepath, filename, err = _save_ledger_image(photo, photo_date)
    if err:
        return jsonify({'error': err}), 400

    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO ledger_photos (filename, photo_date, branch, created_at) VALUES (?, ?, ?, ?)',
        (filename, photo_date, branch, now),
    )
    conn.commit()

    ts = f'{photo_date} 00:00:00'
    te = f'{photo_date} 23:59:59'
    existing = {
        r['plate'] for r in conn.execute(
            'SELECT DISTINCT plate FROM vehicles WHERE branch=? AND created_at>=? AND created_at<=?',
            (branch, ts, te),
        ).fetchall()
    }
    conn.close()

    ocr_ok = ledger_ocr.ocr_available()
    raw_text, ocr_err = ledger_ocr.run_ocr(filepath) if ocr_ok else ('', 'Tesseract kurulu değil')
    rows = ledger_ocr.parse_ocr_text(raw_text) if raw_text else []

    for row in rows:
        row['already_today'] = row['plate'] in existing

    return jsonify({
        'success': True,
        'filename': filename,
        'ocr_available': ocr_ok,
        'ocr_error': ocr_err,
        'raw_text': raw_text[:2000] if raw_text else '',
        'rows': rows,
    })


@app.route('/api/import_ledger_rows', methods=['POST'])
@login_required
def import_ledger_rows():
    d = request.json or {}
    rows = d.get('rows', [])
    branch = d.get('branch', 'Şube 1')
    photo_date = d.get('photo_date', datetime.datetime.now().strftime('%Y-%m-%d'))

    if not rows:
        return jsonify({'error': 'İçe aktarılacak kayıt yok!'}), 400

    conn = get_db_connection()
    if is_day_closed(conn, photo_date, branch):
        conn.close()
        return jsonify({'error': 'Bu gün kapatıldığı için yeni kayıt eklenemez!'}), 400

    imported = skipped = 0
    errors = []
    now_base = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for i, row in enumerate(rows):
        plate = (row.get('plate') or '').strip().upper()
        wt = row.get('wash_type') or 'İç-Dış Yıkama'
        pm = row.get('payment_method') or 'nakit'
        price = row.get('price')
        vc = row.get('vehicle_category') or 'otomobil'
        if not plate or price in (None, '', 0):
            errors.append(f'Satır {i + 1}: plaka veya tutar eksik')
            continue
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            errors.append(f'Satır {i + 1}: geçersiz tutar')
            continue
        if row.get('skip'):
            skipped += 1
            continue
        paid_at = None if pm == 'bekliyor' else now_base
        conn.execute(
            'INSERT INTO vehicles (plate, wash_type, payment_method, price, created_at, brand_model, vehicle_category, branch, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (plate, wt, pm, price_f, now_base, '', vc, branch, paid_at),
        )
        imported += 1

    conn.commit()
    conn.close()
    return jsonify({'success': True, 'imported': imported, 'skipped': skipped, 'errors': errors})


# ── Dashboard Data ──
@app.route('/api/dashboard_data', methods=['GET'])
@login_required
def get_dashboard_data():
    conn = get_db_connection()
    target_date = request.args.get('date')
    branch = request.args.get('branch', 'Şube 1')
    if target_date:
        ts, te = f"{target_date} 00:00:00", f"{target_date} 23:59:59"
    else:
        target_date = datetime.datetime.now().strftime('%Y-%m-%d')
        ts = f"{target_date} 00:00:00"
        te = f"{target_date} 23:59:59"

    vehicles = conn.execute(
        'SELECT * FROM vehicles WHERE created_at>=? AND created_at<=? AND branch=? ORDER BY created_at DESC',
        (ts, te, branch),
    ).fetchall()
    expenses = conn.execute(
        'SELECT * FROM expenses WHERE created_at>=? AND created_at<=? AND branch=? ORDER BY created_at DESC',
        (ts, te, branch),
    ).fetchall()
    is_closed = is_day_closed(conn, target_date, branch)
    all_branch = [dict(r) for r in conn.execute('SELECT * FROM vehicles WHERE branch=?', (branch,)).fetchall()]

    vlist = []
    for row in vehicles:
        v = dict(row)
        vc = conn.execute(
            'SELECT COUNT(*) FROM vehicles WHERE plate=? AND branch=? AND id<=?',
            (v['plate'], branch, v['id']),
        ).fetchone()[0]
        v['visit_count'] = vc
        v.setdefault('brand_model', '')
        v.setdefault('vehicle_category', 'otomobil')
        vlist.append(v)
    elist = [dict(r) for r in expenses]

    total_cash, total_cc, total_havale = sum_revenue(all_branch, ts, te)
    total_rev = total_cash + total_cc + total_havale
    total_exp = sum(e['amount'] for e in elist)
    conn.close()
    return jsonify({
        'vehicles': vlist,
        'expenses': elist,
        'summary': {
            'total_revenue': total_rev,
            'total_cash': total_cash,
            'total_cc': total_cc,
            'total_havale': total_havale,
            'total_expenses': total_exp,
            'remaining_cash': total_cash - total_exp,
            'is_closed': is_closed,
        },
    })


@app.route('/api/close_day', methods=['POST'])
@login_required
def close_day():
    d = request.json
    date = d.get('date')
    branch = d.get('branch', 'Şube 1')
    if not date:
        return jsonify({'error': 'Tarih gerekli!'}), 400
    conn = get_db_connection()
    try:
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            'INSERT INTO closed_days (date, branch, closed_at) VALUES (?, ?, ?)',
            (date, branch, now),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    finally:
        conn.close()
    return jsonify({'success': True})


@app.route('/api/reopen_day', methods=['POST'])
@login_required
def reopen_day():
    d = request.json
    date = d.get('date')
    branch = d.get('branch', 'Şube 1')
    if not date:
        return jsonify({'error': 'Tarih gerekli!'}), 400
    conn = get_db_connection()
    conn.execute('DELETE FROM closed_days WHERE date=? AND branch=?', (date, branch))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/receivables')
@login_required
def receivables_page():
    return render_template('receivables.html')


@app.route('/api/receivables_data', methods=['GET'])
@login_required
def receivables_data():
    branch = request.args.get('branch', 'Şube 1')
    conn = get_db_connection()
    rows = conn.execute(
        '''SELECT plate, brand_model, SUM(price) as total_debt, COUNT(id) as wash_count,
           GROUP_CONCAT(id) as ids, MAX(created_at) as last_visit
           FROM vehicles WHERE payment_method="bekliyor" AND branch=?
           GROUP BY plate ORDER BY total_debt DESC''',
        (branch,),
    ).fetchall()
    conn.close()
    return jsonify({'receivables': [dict(r) for r in rows]})


@app.route('/api/pay_bulk', methods=['POST'])
@login_required
def pay_bulk():
    d = request.json
    plate = d.get('plate')
    pm = d.get('payment_method')
    branch = d.get('branch', 'Şube 1')
    if not all([plate, pm]):
        return jsonify({'error': 'Eksik bilgi!'}), 400
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    discount = get_cash_discount()
    conn = get_db_connection()
    if pm == 'nakit':
        conn.execute(
            '''UPDATE vehicles SET payment_method=?, paid_at=?,
               price=MAX(0, price - ?) WHERE plate=? AND payment_method="bekliyor" AND branch=?''',
            (pm, now, discount, plate, branch),
        )
    else:
        conn.execute(
            'UPDATE vehicles SET payment_method=?, paid_at=? WHERE plate=? AND payment_method="bekliyor" AND branch=?',
            (pm, now, plate, branch),
        )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/print_report')
@login_required
def print_report():
    target_date = request.args.get('date', datetime.datetime.now().strftime('%Y-%m-%d'))
    branch = request.args.get('branch', 'Şube 1')
    ts = f"{target_date} 00:00:00"
    te = f"{target_date} 23:59:59"

    conn = get_db_connection()
    vehicles = conn.execute(
        'SELECT * FROM vehicles WHERE created_at>=? AND created_at<=? AND branch=? ORDER BY created_at ASC',
        (ts, te, branch),
    ).fetchall()
    expenses = conn.execute(
        'SELECT * FROM expenses WHERE created_at>=? AND created_at<=? AND branch=? ORDER BY created_at ASC',
        (ts, te, branch),
    ).fetchall()
    all_branch = [dict(r) for r in conn.execute('SELECT * FROM vehicles WHERE branch=?', (branch,)).fetchall()]

    vlist = [dict(v) for v in vehicles]
    elist = [dict(e) for e in expenses]
    total_cash, total_cc, total_havale = sum_revenue(all_branch, ts, te)
    total_rev = total_cash + total_cc + total_havale
    total_exp = sum(e['amount'] for e in elist)

    real_cash = request.args.get('real_cash', '')
    real_cc = request.args.get('real_cc', '')
    lang = request.args.get('lang', 'en')

    diff_cash = diff_cc = None
    if real_cash:
        try:
            diff_cash = float(real_cash) - (total_cash - total_exp)
        except ValueError:
            pass
    if real_cc:
        try:
            diff_cc = float(real_cc) - total_cc
        except ValueError:
            pass

    summary = {
        'total_revenue': total_rev,
        'total_cash': total_cash,
        'total_cc': total_cc,
        'total_havale': total_havale,
        'total_expenses': total_exp,
        'remaining_cash': total_cash - total_exp,
        'real_cash': real_cash,
        'real_cc': real_cc,
        'diff_cash': diff_cash,
        'diff_cc': diff_cc,
    }
    conn.close()

    now_str = datetime.datetime.now().strftime('%d.%m.%Y %H:%M')
    return render_template(
        'print_report.html',
        date=target_date,
        branch=branch,
        vehicles=vlist,
        expenses=elist,
        summary=summary,
        now=now_str,
        lang=lang,
    )


@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    app.run(host='0.0.0.0', debug=debug, port=port)
