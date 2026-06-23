let priceConfig = {
    'İç-Dış Yıkama': { otomobil: 900, suv: 1000 },
    'İç Yıkama': { otomobil: 500, suv: 600 },
    'Dış Yıkama': { otomobil: 400, suv: 500 },
    'Motor Yıkama': { otomobil: 300, suv: 350 },
    'Detaylı Temizlik': { otomobil: 1500, suv: 1800 },
    'Pasta Cila': { otomobil: 2000, suv: 2500 }
};
const formatCurrency = (a) => new Intl.NumberFormat(getLocale(),{style:'currency',currency:'TRY'}).format(a);
const formatTime = (d) => new Date(d).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'});
let currentBranch = localStorage.getItem('branch') || 'Şube 1';
let currentSystemData = { remaining_cash:0, total_cc:0 };
let cachedVehicles = [];
let cashDiscount = 100;
window.cashDiscount = cashDiscount;
let plateTodayCount = 0;
let suggestTimer;
let turboMode = localStorage.getItem('turboMode') === '1';
let turboDetailsOpen = false;

const syncTurboUI = () => {
    if (!turboMode) return;
    const cat = document.querySelector('input[name="vehicle_category"]:checked')?.value || 'otomobil';
    const pm = document.querySelector('input[name="payment_method"]:checked')?.value || 'nakit';
    const wt = document.getElementById('wash-type')?.value || 'İç-Dış Yıkama';
    const price = document.getElementById('price')?.value || '0';
    document.getElementById('btn-turbo-otomobil')?.classList.toggle('active', cat === 'otomobil');
    document.getElementById('btn-turbo-suv')?.classList.toggle('active', cat === 'suv');
    document.getElementById('btn-turbo-nakit')?.classList.toggle('active', pm === 'nakit');
    document.getElementById('btn-turbo-kart')?.classList.toggle('active', pm === 'kk');
    const summary = document.getElementById('turbo-summary');
    if (summary) {
        summary.textContent = `${tWashType(wt)} · ${tPaymentPm(pm)} · ${formatCurrency(Number(price) || 0)}`;
    }
    const submit = document.getElementById('btn-vehicle-submit');
    if (submit) submit.textContent = t('⚡ Kaydet');
};

const restoreTurboDefaults = () => {
    const cat = localStorage.getItem(`turboCat_${currentBranch}`) || 'otomobil';
    document.getElementById('wash-type').value = 'İç-Dış Yıkama';
    document.getElementById(cat === 'suv' ? 'cat-suv' : 'cat-otomobil').checked = true;
    restoreLastPayment();
    updateSuggestedPrice();
};

const applyTurboLayout = () => {
    const panel = document.getElementById('vehicle-panel');
    const normal = document.getElementById('vehicle-form-normal');
    const extra = document.getElementById('vehicle-form-extra');
    const turboBar = document.getElementById('turbo-bar');
    const btn = document.getElementById('btn-turbo-toggle');
    const plate = document.getElementById('plate');
    if (!panel) return;
    panel.classList.toggle('turbo-active', turboMode);
    if (normal) normal.style.display = turboMode ? 'none' : '';
    if (turboBar) turboBar.style.display = turboMode ? 'block' : 'none';
    if (btn) {
        btn.classList.toggle('active', turboMode);
        btn.textContent = turboMode ? t('⚡ Turbo Açık') : t('⚡ Turbo');
    }
    if (extra) extra.style.display = turboMode && !turboDetailsOpen ? 'none' : '';
    const submit = document.getElementById('btn-vehicle-submit');
    if (submit) submit.textContent = turboMode ? t('⚡ Kaydet') : t('Aracı Kaydet');
    if (turboMode) {
        restoreTurboDefaults();
        syncTurboUI();
        setTimeout(() => focusPlateInput(), 50);
    }
};

window.toggleTurboMode = () => {
    turboMode = !turboMode;
    turboDetailsOpen = false;
    localStorage.setItem('turboMode', turboMode ? '1' : '0');
    applyTurboLayout();
    showToast(turboMode ? t('⚡ Turbo mod açık') : t('Normal forma döndün'));
};

window.setTurboCategory = (cat) => {
    document.getElementById(cat === 'suv' ? 'cat-suv' : 'cat-otomobil').checked = true;
    localStorage.setItem(`turboCat_${currentBranch}`, cat);
    document.getElementById('wash-type').value = 'İç-Dış Yıkama';
    updateSuggestedPrice();
    syncTurboUI();
    focusPlateInput();
};

window.setTurboPayment = (pm) => {
    setPaymentMethod(pm);
    syncTurboUI();
    focusPlateInput();
};

const focusPlateInput = () => {
    if (document.body.classList.contains('touch-device')) return;
    document.getElementById('plate')?.focus();
};

const formatPlateValue = (raw) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const m = clean.match(/^(\d{0,2})([A-Z]{0,3})(\d{0,4})/);
    if (!m) return clean;
    return [m[1], m[2], m[3]].filter(Boolean).join(' ');
};

window.toggleTurboDetails = () => {
    turboDetailsOpen = !turboDetailsOpen;
    const extra = document.getElementById('vehicle-form-extra');
    if (extra) extra.style.display = turboDetailsOpen ? '' : 'none';
};

const calcPrice = (listPrice, paymentMethod) => {
    const base = Number(listPrice) || 0;
    return paymentMethod === 'nakit' ? Math.max(0, base - cashDiscount) : base;
};

const setPaymentMethod = (pm) => {
    const ids = { nakit: 'pay-cash', kk: 'pay-cc', havale: 'pay-havale', bekliyor: 'pay-pending' };
    if (!ids[pm]) return;
    document.getElementById(ids[pm]).checked = true;
    const p = document.getElementById('price');
    if (pm === 'bekliyor') { p.placeholder = t('Borç tutarı'); } else { p.placeholder = t('Örn: 250'); }
    p.disabled = false;
    p.setAttribute('required', 'true');
    updateSuggestedPrice();
    localStorage.setItem(`lastPayment_${currentBranch}`, pm);
    syncTurboUI();
};

const restoreLastPayment = () => {
    const pm = localStorage.getItem(`lastPayment_${currentBranch}`);
    if (pm) setPaymentMethod(pm);
};

const updateRepeatButton = () => {
    const btn = document.getElementById('btn-repeat-last');
    if (btn) btn.style.display = localStorage.getItem(`lastVehicle_${currentBranch}`) ? 'block' : 'none';
};

window.applyPreset = (washType, category, payment) => {
    document.getElementById('wash-type').value = washType;
    document.getElementById(category === 'suv' ? 'cat-suv' : 'cat-otomobil').checked = true;
    setPaymentMethod(payment);
    document.getElementById('plate').focus();
};

window.repeatLastCustomer = () => {
    const raw = localStorage.getItem(`lastVehicle_${currentBranch}`);
    if (!raw) return;
    try {
        const last = JSON.parse(raw);
        document.getElementById('plate').value = last.plate || '';
        document.getElementById('brand-model').value = last.brand_model || '';
        document.getElementById('wash-type').value = last.wash_type || 'İç-Dış Yıkama';
        document.getElementById(last.vehicle_category === 'suv' ? 'cat-suv' : 'cat-otomobil').checked = true;
        setPaymentMethod(last.payment_method || 'nakit');
        document.getElementById('price').value = last.price || '';
        if (last.plate) lookupPlate(last.plate);
        document.getElementById('plate').focus();
        showToast(t('↩ Son kayıt yüklendi'));
    } catch (e) {}
};

const isModalOpen = () => [...document.querySelectorAll('.modal')].some(m => m.style.display === 'flex');

const saveLastVehicle = (payload) => {
    localStorage.setItem(`lastVehicle_${currentBranch}`, JSON.stringify(payload));
    localStorage.setItem(`lastPayment_${currentBranch}`, payload.payment_method);
    updateRepeatButton();
};

const resetVehicleFormAfterSave = (vd) => {
    if (turboMode) {
        document.getElementById('vehicle-form').reset();
        if (vd) document.getElementById('vehicle-date').value = vd.replace(' ', 'T').slice(0, 16);
        turboDetailsOpen = false;
        restoreTurboDefaults();
        focusPlateInput();
        document.getElementById('loyalty-badge').innerText = '';
        document.getElementById('duplicate-warning').style.display = 'none';
        document.getElementById('plate-history-link').style.display = 'none';
        plateTodayCount = 0;
        applyTurboLayout();
        return;
    }
    const wash = document.getElementById('wash-type').value;
    const cat = document.querySelector('input[name="vehicle_category"]:checked').value;
    document.getElementById('vehicle-form').reset();
    if (vd) document.getElementById('vehicle-date').value = vd.replace(' ', 'T').slice(0, 16);
    document.getElementById('wash-type').value = wash;
    document.getElementById(cat === 'suv' ? 'cat-suv' : 'cat-otomobil').checked = true;
    restoreLastPayment();
    document.getElementById('plate').focus();
    document.getElementById('loyalty-badge').innerText = '';
    document.getElementById('duplicate-warning').style.display = 'none';
    document.getElementById('plate-history-link').style.display = 'none';
    plateTodayCount = 0;
    setTimeout(updateSuggestedPrice, 50);
};

// Date defaults for forms
const setFormDates = () => {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const ds = d.toISOString().slice(0,16);
    document.getElementById('vehicle-date').value = ds;
    document.getElementById('expense-date').value = ds;
};

// Toast
window.showToast = (msg, type='success') => {
    const c = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    if (type === 'error') el.style.backgroundColor = 'var(--color-expense)';
    el.innerText = t(msg);
    c.appendChild(el);
    setTimeout(() => el.remove(), 3000);
};

// Date filter
const filterDateInput = document.getElementById('filter-date');
const td = new Date();
const todayStr = td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0')+'-'+String(td.getDate()).padStart(2,'0');
filterDateInput.value = todayStr;
filterDateInput.addEventListener('change', () => { refreshDashboard(); loadLedgerPhotos(); });
window.quickDate = (type) => {
    const d = new Date(); if(type==='yesterday') d.setDate(d.getDate()-1);
    filterDateInput.value = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    refreshDashboard(); loadLedgerPhotos();
};

// Branch
window.switchBranch = (b) => { currentBranch = b; localStorage.setItem('branch', b); restoreLastPayment(); updateRepeatButton(); refreshDashboard(); loadLedgerPhotos(); loadRecentPlates(); if (turboMode) restoreTurboDefaults(), syncTurboUI(); };

// Load Draft Reconciliation
const loadSavedReconciliation = () => {
    const d = filterDateInput.value || todayStr;
    document.getElementById('real-cash').value = localStorage.getItem(`realCash_${d}_${currentBranch}`) || '';
    document.getElementById('real-cc').value = localStorage.getItem(`realCc_${d}_${currentBranch}`) || '';
};

// Settings & Init
async function loadSettings() {
    try {
        const res = await fetch('/api/settings'); const data = await res.json();
        if(data.settings.app_name) { document.getElementById('app-logo').innerText = data.settings.app_name; document.title = data.settings.app_name; }
        const sel = document.getElementById('branch-select'); sel.innerHTML = '';
        data.branches.forEach(b => { const o = document.createElement('option'); o.value=b; o.textContent=tBranch(b); if(b===currentBranch) o.selected=true; sel.appendChild(o); });
        if(!data.branches.includes(currentBranch) && data.branches.length) { currentBranch=data.branches[0]; localStorage.setItem('branch',currentBranch); sel.value=currentBranch; }
        if(data.settings.prices) priceConfig = data.settings.prices;
        if(data.settings.cash_discount) { cashDiscount = parseFloat(data.settings.cash_discount) || 100; window.cashDiscount = cashDiscount; }
    } catch(e) { console.error(e); }
}
window.addBranch = async () => {
    const name = document.getElementById('settings-branch-name').value.trim();
    if(!name) return;
    const r = await fetch('/api/branches', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name}) });
    const d = await r.json();
    if(r.ok) { document.getElementById('settings-branch-name').value=''; loadSettings(); showToast(t('✅ Şube eklendi!')); }
    else showToast(t(d.error) || t('Hata!'), 'error');
};
window.restoreDb = async () => {
    const fi = document.getElementById('settings-restore-file');
    if(!fi.files.length) { showToast(t('Dosya seçin!'), 'error'); return; }
    if(!confirm(t('Mevcut veritabanı yedeklenip seçilen dosya ile değiştirilecek. Devam?'))) return;
    const fd = new FormData(); fd.append('file', fi.files[0]);
    const r = await fetch('/api/restore', { method:'POST', body: fd });
    if(r.ok) { fi.value=''; showToast(t('✅ Veritabanı geri yüklendi!')); location.reload(); }
    else { const d = await r.json(); showToast(t(d.error) || t('Hata!'), 'error'); }
};
window.openSettings = async () => { 
    document.getElementById('settings-app-name').value = document.getElementById('app-logo').innerText; 
    document.getElementById('settings-admin-password').value = '';
    document.getElementById('settings-cash-discount').value = cashDiscount;
    renderPriceEditor();
    document.getElementById('settings-modal').style.display='flex'; 
};
const renderPriceEditor = () => {
    const c = document.getElementById('settings-prices-container');
    if(!c) return;
    c.innerHTML = '';
    Object.entries(priceConfig).forEach(([wt, cats]) => {
        const block = document.createElement('div');
        block.style.marginBottom = '12px';
        block.innerHTML = `<div style="font-weight:600;margin-bottom:8px;color:var(--color-cc);font-size:13px;">${tWashType(wt)}</div>`;
        ['otomobil', 'suv'].forEach(cat => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px;';
            row.innerHTML = `<label style="width:90px;font-size:12px;">${cat === 'otomobil' ? t('🚗 Otomobil') : t('🚙 SUV')}</label>
                <input type="number" min="0" class="settings-price-input" data-wt="${wt}" data-cat="${cat}" value="${cats[cat] || 0}"
                style="flex:1;padding:8px;border-radius:6px;background:rgba(15,23,42,0.6);color:white;border:1px solid var(--border-color);">`;
            block.appendChild(row);
        });
        c.appendChild(block);
    });
};
window.saveSettings = async () => {
    const name = document.getElementById('settings-app-name').value.trim();
    if(!name) return;
    const payload = {app_name: name};
    const pwd = document.getElementById('settings-admin-password').value;
    if(pwd !== '') payload.admin_password = pwd;
    const prices = {};
    document.querySelectorAll('.settings-price-input').forEach(inp => {
        if(!prices[inp.dataset.wt]) prices[inp.dataset.wt] = {};
        prices[inp.dataset.wt][inp.dataset.cat] = parseFloat(inp.value) || 0;
    });
    payload.prices = prices;
    payload.cash_discount = document.getElementById('settings-cash-discount').value || '100';
    await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    priceConfig = prices;
    cashDiscount = parseFloat(payload.cash_discount) || 100;
    window.cashDiscount = cashDiscount;
    document.getElementById('app-logo').innerText = name; document.title = name;
    document.getElementById('settings-modal').style.display='none';
    updateSuggestedPrice();
    showToast(t('⚙️ Ayarlar kaydedildi!'));
};
window.openPlateHistory = () => {
    const plate = document.getElementById('plate').value.trim().toUpperCase();
    const url = plate ? `/plate_history?plate=${encodeURIComponent(plate)}` : '/plate_history';
    window.location.href = url;
};
const applyLastVisit = (last) => {
    if(!last) return;
    if(last.brand_model) document.getElementById('brand-model').value = last.brand_model;
    if(last.vehicle_category) {
        const id = last.vehicle_category === 'suv' ? 'cat-suv' : 'cat-otomobil';
        const el = document.getElementById(id);
        if(el) el.checked = true;
        if (turboMode) localStorage.setItem(`turboCat_${currentBranch}`, last.vehicle_category);
    }
    if(last.wash_type) {
        const sel = document.getElementById('wash-type');
        if([...sel.options].some(o => o.value === last.wash_type)) sel.value = last.wash_type;
    }
    if (turboMode && last.payment_method) setPaymentMethod(last.payment_method);
    updateSuggestedPrice();
    syncTurboUI();
};
const loadRecentPlates = async () => {
    const wrap = document.getElementById('recent-plates-wrap');
    const box = document.getElementById('recent-plates');
    if (!wrap || !box) return;
    try {
        const r = await fetch(`/api/recent_plates?branch=${encodeURIComponent(currentBranch)}&limit=8`);
        const d = await r.json();
        if (!d.plates?.length) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        const label = wrap.querySelector('.recent-plates-label');
        if (label) label.textContent = t('Son Plakalar');
        box.innerHTML = '';
        d.plates.forEach(p => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-recent-plate';
            btn.textContent = p.plate;
            if (p.brand_model) btn.title = p.brand_model;
            btn.onclick = () => pickRecentPlate(p.plate);
            box.appendChild(btn);
        });
    } catch (e) {}
};
window.pickRecentPlate = (plate) => {
    const el = document.getElementById('plate');
    if (!el) return;
    el.value = plate;
    lookupPlate(plate.trim().toUpperCase());
    el.focus();
};

const loadPlateSuggestions = async (q) => {
    const clean = q.replace(/\s/g, '');
    if(clean.length < 2) return;
    try {
        const r = await fetch(`/api/plate_suggest?q=${encodeURIComponent(clean)}&branch=${encodeURIComponent(currentBranch)}`);
        const d = await r.json();
        document.getElementById('plate-suggestions').innerHTML = d.plates.map(p => `<option value="${p}">`).join('');
    } catch(e) {}
};
const lookupPlate = async (plate) => {
    const vd = document.getElementById('vehicle-date').value;
    const recordDate = vd ? vd.slice(0, 10) : todayStr;
    const badge = document.getElementById('loyalty-badge');
    const dup = document.getElementById('duplicate-warning');
    const histLink = document.getElementById('plate-history-link');
    try {
        const r = await fetch(`/api/check_plate?plate=${encodeURIComponent(plate)}&branch=${encodeURIComponent(currentBranch)}&date=${recordDate}`);
        const d = await r.json();
        plateTodayCount = d.today_count || 0;
        if(d.count > 0) {
            badge.innerText = d.count > 0 ? tVisit(d.count + 1) : t('🌟 Yeni Müşteri');
            histLink.style.display = 'inline';
            applyLastVisit(d.last);
        } else {
            badge.innerText = t('🌟 Yeni Müşteri');
            histLink.style.display = 'none';
        }
        dup.style.display = plateTodayCount > 0 ? 'block' : 'none';
    } catch(e) {}
};

// Auto-fill price
const updateSuggestedPrice = () => {
    const wt = document.getElementById('wash-type').value;
    const cat = document.querySelector('input[name="vehicle_category"]:checked').value;
    const pm = document.querySelector('input[name="payment_method"]:checked').value;
    const p = priceConfig[wt]; const sp = document.getElementById('suggested-price');
    if(p && p[cat]) {
        const list = p[cat];
        const final = calcPrice(list, pm);
        document.getElementById('price').value = final;
        if(pm === 'nakit') sp.innerText = tPriceHint(list, final, pm);
        else sp.innerText = tPriceHint(list, final, pm);
    } else { sp.innerText = ''; }
    syncTurboUI();
};
document.getElementById('wash-type').addEventListener('change', updateSuggestedPrice);
document.querySelectorAll('input[name="vehicle_category"]').forEach(r => r.addEventListener('change', updateSuggestedPrice));
setTimeout(updateSuggestedPrice, 100);

// Dashboard
const refreshDashboard = async () => {
    try {
        const selectedDate = filterDateInput.value || todayStr;
        const isToday = selectedDate === todayStr;
        document.getElementById('vehicles-title').innerText = isToday ? t('Bugünün Araçları') : t('Geçmiş Araçlar') + ' (' + selectedDate + ')';
        document.getElementById('expenses-title').innerText = isToday ? t('Bugünün Giderleri') : t('Geçmiş Giderler') + ' (' + selectedDate + ')';
        const res = await fetch(`/api/dashboard_data?date=${selectedDate}&branch=${encodeURIComponent(currentBranch)}`);
        const data = await res.json();
        cachedVehicles = data.vehicles;
        document.getElementById('val-total-rev').innerText = formatCurrency(data.summary.total_revenue);
        document.getElementById('val-total-cash').innerText = formatCurrency(data.summary.total_cash);
        document.getElementById('val-total-cc').innerText = formatCurrency(data.summary.total_cc);
        document.getElementById('val-total-havale').innerText = formatCurrency(data.summary.total_havale);
        document.getElementById('val-total-exp').innerText = formatCurrency(data.summary.total_expenses);
        document.getElementById('val-rem-cash').innerText = formatCurrency(data.summary.remaining_cash);
        currentSystemData.remaining_cash = data.summary.remaining_cash;
        currentSystemData.total_cc = data.summary.total_cc;
        
        // Handle closed day UI
        if(data.summary.is_closed) {
            document.getElementById('closed-day-banner').style.display = 'block';
            document.getElementById('btn-reopen-day').style.display = 'inline-block';
            document.getElementById('vehicle-form').querySelector('button[type="submit"]').disabled = true;
            document.getElementById('expense-form').querySelector('button[type="submit"]').disabled = true;
            document.getElementById('z-report-box').querySelector('button.btn-close-day').disabled = true;
            document.getElementById('real-cash').disabled = true;
            document.getElementById('real-cc').disabled = true;
        } else {
            document.getElementById('closed-day-banner').style.display = 'none';
            document.getElementById('btn-reopen-day').style.display = 'none';
            document.getElementById('vehicle-form').querySelector('button[type="submit"]').disabled = false;
            document.getElementById('expense-form').querySelector('button[type="submit"]').disabled = false;
            document.getElementById('z-report-box').querySelector('button.btn-close-day').disabled = false;
            document.getElementById('real-cash').disabled = false;
            document.getElementById('real-cc').disabled = false;
        }

        // Vehicles
        const vBody = document.getElementById('vehicles-body'); vBody.innerHTML = '';
        if(!data.vehicles.length) { vBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">${t('Kayıt bulunamadı.')}</td></tr>`; }
        else { data.vehicles.forEach(v => {
            const tr = document.createElement('tr');
            let bc='badge-pending',bt=t('BEKLİYOR'),rc='row-pending';
            if(v.payment_method==='nakit'){bc='badge-cash';bt=t('NAKİT');rc='row-cash';}
            else if(v.payment_method==='kk'){bc='badge-cc';bt=t('KREDİ KARTI');rc='row-cc';}
            else if(v.payment_method==='havale'){bc='badge-havale';bt=t('HAVALE');rc='row-havale';}
            let ab='';
            if(!data.summary.is_closed) {
                if(v.payment_method==='bekliyor') ab+=`<button class="btn-pay" onclick="openPaymentModal(${v.id},'${v.plate}')">${t('Ödeme Al')}</button> `;
                const be=(v.brand_model||'').replace(/'/g,"\\'"), ce=(v.vehicle_category||'otomobil').replace(/'/g,"\\'");
                ab+=`<button class="btn-edit" onclick="openEditVehicle(${v.id},'${v.plate}','${v.wash_type}','${v.payment_method}',${v.price},'${be}','${ce}')">${t('Düzenle')}</button> `;
                ab+=`<button class="btn-delete" onclick="deleteVehicle(${v.id})">${t('Sil')}</button>`;
            }
            tr.className=rc;
            const ls=v.visit_count>1?`<span style="color:#f59e0b;font-size:11px;display:block;margin-top:2px;">⭐ ${v.visit_count}. ${t('Yıkama')}</span>`:'';
            const bi=v.brand_model?`<span style="color:var(--text-muted);font-size:11px;display:block;">${v.brand_model}</span>`:'';
            const ci=v.vehicle_category==='suv'?'🚙':'🚗';
            const priceDisplay = v.payment_method==='bekliyor' ? formatCurrency(v.price)+' '+t('(borç)') : formatCurrency(v.price);
            tr.innerHTML=`<td>${formatTime(v.created_at)}</td><td style="font-weight:bold;">${ci} ${v.plate} ${bi} ${ls}</td><td>${tWashType(v.wash_type)}</td><td style="font-weight:600;">${priceDisplay}</td><td><span class="badge ${bc}">${bt}</span></td><td style="white-space:nowrap;">${ab}</td>`;
            vBody.appendChild(tr);
        });}
        // Expenses
        const eBody = document.getElementById('expenses-body'); eBody.innerHTML = '';
        if(!data.expenses.length) { eBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">${t('Gider kaydı bulunamadı.')}</td></tr>`; }
        else { data.expenses.forEach(e => {
            const tr = document.createElement('tr');
            const cb=e.category?`<span class="badge" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:4px 8px;font-size:11px;">${t(e.category)}</span>`:'';
            const actionBtns = data.summary.is_closed ? '' : `<button class="btn-edit" onclick="openEditExpense(${e.id},'${(e.category||'Diğer')}','${e.description.replace(/'/g,"\\'")}',${e.amount})">${t('Düzenle')}</button> <button class="btn-delete" onclick="deleteExpense(${e.id})">${t('Sil')}</button>`;
            tr.innerHTML=`<td>${formatTime(e.created_at)}</td><td>${cb}</td><td>${e.description}</td><td style="font-weight:600;color:var(--color-expense);">${formatCurrency(e.amount)}</td><td style="white-space:nowrap;">${actionBtns}</td>`;
            eBody.appendChild(tr);
        });}
        loadSavedReconciliation();
        calculateReconciliation();
    } catch(e) { console.error(e); }
};

// Payment toggle
document.querySelectorAll('input[name="payment_method"]').forEach(r => {
    r.addEventListener('change', (e) => setPaymentMethod(e.target.value));
});

// Keyboard shortcuts (vehicle form)
document.addEventListener('keydown', (e) => {
    if (isModalOpen()) return;
    const form = document.getElementById('vehicle-form');
    if (!form || !form.contains(e.target)) return;
    const tag = e.target.tagName;
    const type = e.target.type || '';
    const typingField = tag === 'TEXTAREA' || (tag === 'INPUT' && ['text', 'number', 'datetime-local', 'password'].includes(type));

    if (e.key === 'Enter' && tag !== 'TEXTAREA' && type !== 'submit') {
        e.preventDefault();
        form.requestSubmit();
        return;
    }
    if (!typingField) {
        const map = { '1': 'nakit', '2': 'kk', '3': 'bekliyor', '4': 'havale' };
        if (map[e.key]) {
            e.preventDefault();
            setPaymentMethod(map[e.key]);
        }
    }
});

// Plate checker, autocomplete & auto-fill
const plateInput = document.getElementById('plate'); let typingTimer;
if (plateInput) {
plateInput.addEventListener('input', (e) => {
    const input = e.target;
    const pos = input.selectionStart ?? input.value.length;
    const before = input.value;
    const formatted = formatPlateValue(before);
    if (formatted !== before) {
        input.value = formatted;
        const diff = formatted.length - before.length;
        const next = Math.max(0, Math.min(formatted.length, pos + diff));
        try { input.setSelectionRange(next, next); } catch (err) {}
    }

    clearTimeout(typingTimer);
    document.getElementById('loyalty-badge').innerText = '';
    document.getElementById('duplicate-warning').style.display = 'none';
    document.getElementById('plate-history-link').style.display = 'none';
    plateTodayCount = 0;
    const p = plateInput.value.trim().toUpperCase();
    clearTimeout(suggestTimer);
    if(p.length >= 2) suggestTimer = setTimeout(() => loadPlateSuggestions(p), 300);
    if(p.length >= 5) typingTimer = setTimeout(() => lookupPlate(p), 500);
});
plateInput.addEventListener('change', () => {
    const p = plateInput.value.trim().toUpperCase();
    if(p.length >= 5) lookupPlate(p);
});
}
document.getElementById('vehicle-date')?.addEventListener('change', () => {
    if (!plateInput) return;
    const p = plateInput.value.trim().toUpperCase();
    if(p.length >= 5) lookupPlate(p);
});

// Reconciliation auto-update & draft saving
document.getElementById('real-cash').addEventListener('input', (e) => {
    const d = filterDateInput.value || todayStr;
    localStorage.setItem(`realCash_${d}_${currentBranch}`, e.target.value);
    window.calculateReconciliation();
});
document.getElementById('real-cc').addEventListener('input', (e) => {
    const d = filterDateInput.value || todayStr;
    localStorage.setItem(`realCc_${d}_${currentBranch}`, e.target.value);
    window.calculateReconciliation();
});

// Add vehicle
document.getElementById('vehicle-form').addEventListener('submit', async(e)=>{
    e.preventDefault();
    const plateVal = document.getElementById('plate').value.toUpperCase();
    if(!plateVal) { showToast(t('Plaka girin!'), 'error'); return; }
    if(plateTodayCount > 0 && !confirm(t('Bu plaka bugün zaten kayıtlı. Yine de eklemek istiyor musunuz?'))) return;
    let vd = document.getElementById('vehicle-date').value; if(vd) vd = vd.replace('T', ' ') + ':00';
    const payload = { plate:plateVal, wash_type:document.getElementById('wash-type').value,
        payment_method:document.querySelector('input[name="payment_method"]:checked').value, price:document.getElementById('price').value,
        brand_model:document.getElementById('brand-model').value, vehicle_category:document.querySelector('input[name="vehicle_category"]:checked').value, branch:currentBranch,
        created_at: vd };
    try { const r=await fetch('/api/add_vehicle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(r.ok){
            saveLastVehicle(payload);
            resetVehicleFormAfterSave(vd);
            refreshDashboard();showToast(t('✅ Araç eklendi!')); loadRecentPlates();
        }
        else { const err=await r.json(); showToast(t(err.error)||t('Hata!'),'error'); }
    }catch(e){showToast(t('Hata!'),'error');}
});

// Add expense
document.getElementById('expense-form').addEventListener('submit', async(e)=>{
    e.preventDefault();
    let ed = document.getElementById('expense-date').value; if(ed) ed = ed.replace('T', ' ') + ':00';
    const payload={description:document.getElementById('exp-desc').value,amount:document.getElementById('exp-amount').value,category:document.getElementById('expense-category').value,branch:currentBranch,created_at:ed};
    try{const r=await fetch('/api/add_expense',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(r.ok){
            document.getElementById('expense-form').reset();
            if(ed) document.getElementById('expense-date').value = ed.replace(' ', 'T').slice(0,16);
            refreshDashboard();showToast(t('✅ Gider eklendi!'));
        }else alert(t('Hata!'));
    }catch(e){alert(t('Hata!'));}
});

// Reconciliation
window.calculateReconciliation = () => {
    const rc=document.getElementById('real-cash').value,rcc=document.getElementById('real-cc').value,rd=document.getElementById('reconciliation-results');
    if(rc===''&&rcc===''){rd.style.display='none';return;} rd.style.display='block';
    
    const elCash=document.getElementById('diff-cash');
    if(rc!==''){
        const v=parseFloat(rc)-currentSystemData.remaining_cash; elCash.innerText=formatCurrency(v);
        if(v>0){elCash.className='diff-val positive';elCash.innerText='+'+elCash.innerText+' ('+t('Fazla')+')';}
        else if(v<0){elCash.className='diff-val negative';elCash.innerText=elCash.innerText+' ('+t('Açık')+')';}
        else{elCash.className='diff-val zero';elCash.innerText=t('Tam Uyumlu');}
    } else { elCash.innerText = '-'; elCash.className='diff-val zero'; }

    const elCc=document.getElementById('diff-cc');
    if(rcc!==''){
        const v=parseFloat(rcc)-currentSystemData.total_cc; elCc.innerText=formatCurrency(v);
        if(v>0){elCc.className='diff-val positive';elCc.innerText='+'+elCc.innerText+' ('+t('Fazla')+')';}
        else if(v<0){elCc.className='diff-val negative';elCc.innerText=elCc.innerText+' ('+t('Açık')+')';}
        else{elCc.className='diff-val zero';elCc.innerText=t('Tam Uyumlu');}
    } else { elCc.innerText = '-'; elCc.className='diff-val zero'; }
};

window.closeDay = async () => {
    if(!confirm(t('DİKKAT! Bu günü kapattığınızda artık bu tarihe geçmişe dönük işlem (Ekleme/Silme/Düzenleme) yapamayacaksınız. Onaylıyor musunuz?'))) return;
    try {
        const d = filterDateInput.value || todayStr;
        const r = await fetch('/api/close_day', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({date:d, branch:currentBranch}) });
        if(r.ok) { refreshDashboard(); showToast(t('🔒 Gün başarıyla kapatıldı ve donduruldu!')); }
        else showToast(t('Hata!'), 'error');
    } catch(e) {}
};

window.reopenDay = async () => {
    if(!confirm(t('Bu günü yeniden açmak istediğinize emin misiniz?'))) return;
    try {
        const d = filterDateInput.value || todayStr;
        const r = await fetch('/api/reopen_day', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({date:d, branch:currentBranch}) });
        if(r.ok) { refreshDashboard(); showToast(t('🔓 Gün yeniden açıldı!')); }
        else showToast(t('Hata!'), 'error');
    } catch(e) {}
};

window.printReport = () => {
    const d = filterDateInput.value || todayStr;
    const rc = document.getElementById('real-cash').value;
    const rcc = document.getElementById('real-cc').value;
    const l = localStorage.getItem('lang') || 'en';
    const url = `/print_report?date=${d}&branch=${encodeURIComponent(currentBranch)}&real_cash=${rc}&real_cc=${rcc}&lang=${l}`;
    window.open(url, '_blank');
};

// Deletes
window.deleteVehicle = async(id)=>{if(!confirm(t('Silmek istediğinize emin misiniz?')))return;try{const r=await fetch(`/api/delete_vehicle/${id}`,{method:'DELETE'});if(r.ok){refreshDashboard();showToast(t('🗑️ Silindi!'),'error');}else{const d=await r.json();showToast(t(d.error)||t('Hata!'),'error');}}catch(e){}};
window.deleteExpense = async(id)=>{if(!confirm(t('Silmek istediğinize emin misiniz?')))return;try{const r=await fetch(`/api/delete_expense/${id}`,{method:'DELETE'});if(r.ok){refreshDashboard();showToast(t('🗑️ Silindi!'),'error');}else{const d=await r.json();showToast(t(d.error)||t('Hata!'),'error');}}catch(e){}};

// Payment Modal
let currentPaymentId=null, modalBasePrice=0;
const updateModalPrice = () => {
    const m = document.querySelector('input[name="modal_payment"]:checked')?.value;
    const el = document.getElementById('modal-price');
    if(!el || !modalBasePrice) return;
    el.value = calcPrice(modalBasePrice, m);
};
window.openPaymentModal=(id,plate)=>{currentPaymentId=id;const v=cachedVehicles.find(x=>x.id===id);modalBasePrice=v&&v.price?v.price:0;document.getElementById('modal-plate-title').innerText=plate+' '+t('Ödemesi');document.getElementById('modal-pay-cash').checked=true;updateModalPrice();document.getElementById('payment-modal').style.display='flex';};
document.querySelectorAll('input[name="modal_payment"]').forEach(r=>r.addEventListener('change',updateModalPrice));
window.closeModal=()=>{document.getElementById('payment-modal').style.display='none';currentPaymentId=null;modalBasePrice=0;};
window.submitPayment=async()=>{const m=document.querySelector('input[name="modal_payment"]:checked').value,p=document.getElementById('modal-price').value;if(!p){showToast(t('Fiyat girin!'),'error');return;}
    try{const r=await fetch(`/api/pay_vehicle/${currentPaymentId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payment_method:m,price:p})});if(r.ok){closeModal();refreshDashboard();showToast(t('✅ Ödeme alındı!'));}}catch(e){}};

// Edit Modals
let currentEditVId=null,currentEditEId=null;
window.openEditVehicle=(id,plate,type,payment,price,brand,cat)=>{currentEditVId=id;document.getElementById('edit-v-plate').value=plate;document.getElementById('edit-v-brand').value=brand||'';document.getElementById('edit-v-category').value=cat||'otomobil';document.getElementById('edit-v-type').value=type;document.getElementById('edit-v-payment').value=payment;document.getElementById('edit-v-price').value=price;document.getElementById('edit-v-price').disabled=false;document.getElementById('edit-vehicle-modal').style.display='flex';};
window.openEditExpense=(id,cat,desc,amt)=>{currentEditEId=id;document.getElementById('edit-e-category').value=cat;document.getElementById('edit-e-desc').value=desc;document.getElementById('edit-e-amount').value=amt;document.getElementById('edit-expense-modal').style.display='flex';};
window.closeEditModal=(t)=>{document.getElementById(t==='vehicle'?'edit-vehicle-modal':'edit-expense-modal').style.display='none';};
document.getElementById('edit-v-payment').addEventListener('change',()=>{
    const wt=document.getElementById('edit-v-type').value;
    const cat=document.getElementById('edit-v-category').value;
    const pm=document.getElementById('edit-v-payment').value;
    const list=priceConfig[wt]?.[cat];
    if(list) document.getElementById('edit-v-price').value=calcPrice(list,pm);
});
window.submitEditVehicle=async()=>{const pl={plate:document.getElementById('edit-v-plate').value.toUpperCase(),brand_model:document.getElementById('edit-v-brand').value,vehicle_category:document.getElementById('edit-v-category').value,wash_type:document.getElementById('edit-v-type').value,payment_method:document.getElementById('edit-v-payment').value,price:document.getElementById('edit-v-price').value};
    try{const r=await fetch(`/api/edit_vehicle/${currentEditVId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pl)});if(r.ok){closeEditModal('vehicle');refreshDashboard();showToast(t('✏️ Güncellendi!'));}}catch(e){}};
window.submitEditExpense=async()=>{const pl={category:document.getElementById('edit-e-category').value,description:document.getElementById('edit-e-desc').value,amount:document.getElementById('edit-e-amount').value};
    try{const r=await fetch(`/api/edit_expense/${currentEditEId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pl)});if(r.ok){closeEditModal('expense');refreshDashboard();showToast(t('✏️ Güncellendi!'));}}catch(e){}};

// Ledger Photo + OCR import
let ledgerImportRows = [];
let ledgerImportFilename = '';

const washOptions = () => [
    'İç Yıkama', 'Dış Yıkama', 'İç-Dış Yıkama', 'Motor Yıkama', 'Detaylı Temizlik', 'Pasta Cila'
];
const pmOptions = () => [
    ['nakit', 'Nakit'], ['kk', 'Kart'], ['havale', 'Havale'], ['bekliyor', 'Sonra']
];

const renderLedgerImportTable = () => {
    const body = document.getElementById('ledger-import-body');
    if (!body) return;
    body.innerHTML = '';
    ledgerImportRows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        if (row.already_today) tr.style.background = 'rgba(245,158,11,0.08)';
        const wtSel = washOptions().map(w => `<option value="${w}" ${row.wash_type === w ? 'selected' : ''}>${tWashType(w)}</option>`).join('');
        const pmSel = pmOptions().map(([v, l]) => `<option value="${v}" ${row.payment_method === v ? 'selected' : ''}>${t(l)}</option>`).join('');
        const skipChecked = row.skip ? 'checked' : '';
        const dupBadge = row.already_today ? `<div style="font-size:10px;color:var(--color-pending);">${t('Bugün zaten var')}</div>` : '';
        tr.innerHTML = `
            <td><input type="text" data-f="plate" data-i="${idx}" value="${row.plate || ''}" style="width:110px;text-transform:uppercase;">${dupBadge}</td>
            <td><input type="number" data-f="price" data-i="${idx}" value="${row.price || ''}" min="0" style="width:80px;"></td>
            <td><select data-f="payment_method" data-i="${idx}" style="padding:6px;">${pmSel}</select></td>
            <td><select data-f="wash_type" data-i="${idx}" style="padding:6px;max-width:140px;">${wtSel}</select></td>
            <td style="text-align:center;"><input type="checkbox" data-f="skip" data-i="${idx}" ${skipChecked}></td>
            <td><button type="button" class="btn-delete" style="padding:4px 8px;font-size:11px;" onclick="removeLedgerImportRow(${idx})">${t('Sil')}</button></td>`;
        body.appendChild(tr);
    });
    body.querySelectorAll('input,select').forEach(el => {
        el.addEventListener('change', () => {
            const i = +el.dataset.i;
            const f = el.dataset.f;
            if (f === 'skip') ledgerImportRows[i][f] = el.checked;
            else if (f === 'price') ledgerImportRows[i][f] = parseFloat(el.value) || 0;
            else ledgerImportRows[i][f] = el.value;
        });
        if (el.dataset.f === 'plate') {
            el.addEventListener('input', () => { ledgerImportRows[+el.dataset.i].plate = el.value.toUpperCase(); });
        }
    });
    const cnt = document.getElementById('ledger-import-count');
    if (cnt) cnt.textContent = `${ledgerImportRows.length} ${t('kayıt bulundu')}`;
};

window.addLedgerImportRow = () => {
    ledgerImportRows.push({ plate: '', price: 0, payment_method: 'nakit', wash_type: 'İç-Dış Yıkama', skip: false, already_today: false });
    renderLedgerImportTable();
};
window.removeLedgerImportRow = (idx) => {
    ledgerImportRows.splice(idx, 1);
    renderLedgerImportTable();
};

const openLedgerImportModal = (data) => {
    ledgerImportFilename = data.filename || '';
    ledgerImportRows = (data.rows || []).map(r => ({
        ...r,
        skip: !!r.already_today,
    }));
    const prev = document.getElementById('ledger-import-preview');
    if (prev && ledgerImportFilename) prev.src = `/static/uploads/${ledgerImportFilename}`;
    const warn = document.getElementById('ledger-import-warn');
    if (warn) {
        if (!data.ocr_available || data.ocr_error) {
            warn.style.display = 'block';
            warn.textContent = t(data.ocr_error) || t('Tesseract kurulu değil');
        } else if (!ledgerImportRows.length) {
            warn.style.display = 'block';
            warn.textContent = t('Okunan kayıt yok. Satır ekleyebilir veya fotoğrafı yeniden çekebilirsin.');
        } else warn.style.display = 'none';
    }
    renderLedgerImportTable();
    document.getElementById('ledger-import-modal').style.display = 'flex';
};
window.closeLedgerImportModal = () => {
    document.getElementById('ledger-import-modal').style.display = 'none';
    ledgerImportRows = [];
};

window.scanLedger = async () => {
    const fi = document.getElementById('ledger-photo');
    const btn = document.getElementById('btn-scan-ledger');
    if (!fi || !fi.files.length) { showToast(t('Fotoğraf seçin!'), 'error'); return; }
    const prevLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('Okunuyor...'); }
    showToast(t('Defter okunuyor, lütfen bekleyin...'));
    const fd = new FormData();
    fd.append('photo', fi.files[0]);
    fd.append('photo_date', filterDateInput.value || todayStr);
    fd.append('branch', currentBranch);
    try {
        const r = await fetch('/api/scan_ledger', { method: 'POST', body: fd });
        let d;
        try { d = await r.json(); } catch (parseErr) {
            showToast(t('Hata!'), 'error');
            return;
        }
        if (!r.ok) { showToast(t(d.error) || t('Başarısız!'), 'error'); return; }
        fi.value = '';
        loadLedgerPhotos();
        openLedgerImportModal(d);
    } catch (e) {
        showToast(t('Hata!'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
    }
};

window.submitLedgerImport = async () => {
    const body = document.getElementById('ledger-import-body');
    body.querySelectorAll('input,select').forEach(el => {
        const i = +el.dataset.i, f = el.dataset.f;
        if (f === 'skip') ledgerImportRows[i][f] = el.checked;
        else if (f === 'price') ledgerImportRows[i][f] = parseFloat(el.value) || 0;
        else ledgerImportRows[i][f] = el.value;
    });
    const toSend = ledgerImportRows.filter(r => !r.skip && r.plate && r.price);
    if (!toSend.length) { showToast(t('İçe aktarılacak kayıt yok!'), 'error'); return; }
    if (!confirm(t('Okunan kayıtları sisteme eklemek istediğinize emin misiniz?'))) return;
    try {
        const r = await fetch('/api/import_ledger_rows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rows: ledgerImportRows,
                branch: currentBranch,
                photo_date: filterDateInput.value || todayStr,
            }),
        });
        const d = await r.json();
        if (!r.ok) { showToast(t(d.error) || t('Hata!'), 'error'); return; }
        closeLedgerImportModal();
        refreshDashboard();
        loadRecentPlates();
        showToast(`✅ ${d.imported} ${t('kayıt içe aktarıldı!')}`);
        if (ledgerImportFilename) openLedgerCompare(ledgerImportFilename);
    } catch (e) { showToast(t('Hata!'), 'error'); }
};

window.uploadLedger = window.scanLedger;

const loadLedgerPhotos = async () => {
    try{const r=await fetch(`/api/get_ledger_photos?date=${filterDateInput.value||todayStr}&branch=${encodeURIComponent(currentBranch)}`);const d=await r.json();
        const c=document.getElementById('ledger-photos-container');c.innerHTML='';
        d.photos.forEach(p=>{const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.05);';
            div.innerHTML=`<img src="/static/uploads/${p.filename}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="openLedgerCompare('${p.filename}')"><div style="flex:1;"><div style="font-weight:600;font-size:13px;">📋 ${p.photo_date}</div><div style="color:var(--text-muted);font-size:11px;">${t('Karşılaştır için tıkla')}</div></div><button class="btn-delete" style="padding:6px 12px;font-size:12px;" onclick="deleteLedger(${p.id})">${t('Sil')}</button>`;
            c.appendChild(div);});
    }catch(e){}};

window.openLedgerCompare=(filename)=>{
    document.getElementById('ledger-compare-panel').style.display='block';
    document.getElementById('ledger-compare-img').src=`/static/uploads/${filename}`;
    // Build verify list with confirm/edit per record
    const list=document.getElementById('ledger-verify-list'); list.innerHTML='';
    if(!cachedVehicles.length){list.innerHTML=`<p style="color:var(--text-muted);">${t('Kayıt yok.')}</p>`;return;}
    cachedVehicles.forEach(v=>{
        const div=document.createElement('div');
        div.style.cssText='padding:10px;margin-bottom:8px;border-radius:8px;background:rgba(255,255,255,0.05);border-left:3px solid var(--border-color);';
        const ci=v.vehicle_category==='suv'?'🚙':'🚗';
        const pm=tPaymentPm(v.payment_method);
        const bm=v.brand_model?` (${v.brand_model})`:'';
        div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>${ci} ${v.plate}</strong>${bm}<br><span style="font-size:12px;color:var(--text-muted);">${tWashType(v.wash_type)} — ${formatCurrency(v.price)} — ${pm}</span></div><div style="display:flex;gap:6px;"><button class="btn-submit" style="padding:4px 10px;font-size:12px;background:var(--color-cash);" onclick="this.innerText='✓ OK';this.disabled=true;this.style.opacity=0.5;">${t('Doğru ✓')}</button><button class="btn-edit" style="padding:4px 10px;font-size:12px;" onclick="openEditVehicle(${v.id},'${v.plate}','${v.wash_type}','${v.payment_method}',${v.price},'${(v.brand_model||'').replace(/'/g,"\\'")}','${v.vehicle_category||'otomobil'}')">${t('Düzelt ✏️')}</button></div></div>`;
        list.appendChild(div);
    });
    document.getElementById('ledger-compare-panel').scrollIntoView({behavior:'smooth'});
};
window.closeLedgerCompare=()=>{document.getElementById('ledger-compare-panel').style.display='none';};
window.zoomLedger=(src)=>{document.getElementById('zoom-img').src=src;document.getElementById('zoom-modal').style.display='flex';};
window.deleteLedger=async(id)=>{if(confirm(t('Fotoğrafı silmek istediğinize emin misiniz?'))){try{const r=await fetch(`/api/delete_ledger/${id}`,{method:'DELETE'});if(r.ok){showToast(t('🗑️ Silindi!'),'error');loadLedgerPhotos();closeLedgerCompare();}}catch(e){}}};

// Init
loadSettings().then(() => { restoreLastPayment(); updateRepeatButton(); loadRecentPlates(); applyTurboLayout(); });
setFormDates();
refreshDashboard();
loadLedgerPhotos();
document.getElementById('plate')?.focus();
