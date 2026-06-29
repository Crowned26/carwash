(function () {
    let deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    const hint = document.getElementById('pwa-install-hint');
    const btnInstall = document.getElementById('btn-pwa-install');
    const btnDismiss = document.getElementById('btn-pwa-dismiss');

    const t = (key) => (typeof window.t === 'function' ? window.t(key) : key);

    const showBanner = (message, showInstallBtn) => {
        if (!banner || localStorage.getItem('pwa-dismiss')) return;
        if (hint) hint.textContent = message;
        if (btnInstall) btnInstall.style.display = showInstallBtn ? 'inline-block' : 'none';
        banner.style.display = 'flex';
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showBanner(t('Uygulamayı ana ekrana ekleyebilirsin.'), true);
    });

    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isIos && !isStandalone && !localStorage.getItem('pwa-dismiss')) {
        setTimeout(() => {
            if (!deferredPrompt) {
                showBanner(t('Safari: Paylaş → Ana Ekrana Ekle'), false);
            }
        }, 2500);
    }

    window.installPwa = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (e) {}
        deferredPrompt = null;
        if (banner) banner.style.display = 'none';
    };

    window.dismissPwaBanner = () => {
        localStorage.setItem('pwa-dismiss', '1');
        if (banner) banner.style.display = 'none';
    };

    if (btnDismiss) btnDismiss.addEventListener('click', window.dismissPwaBanner);
})();
