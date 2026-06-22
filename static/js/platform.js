(function () {
    const ua = navigator.userAgent;
    const body = document.body;
    const html = document.documentElement;

    if (/iPhone|iPad|iPod/i.test(ua)) body.classList.add('platform-ios');
    else if (/Android/i.test(ua)) body.classList.add('platform-android');
    else if (/Macintosh|Mac OS X/i.test(ua)) body.classList.add('platform-macos');
    else if (/Windows/i.test(ua)) body.classList.add('platform-windows');

    if (window.matchMedia('(pointer: coarse)').matches) body.classList.add('touch-device');
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        body.classList.add('pwa-standalone');
    }

    const setAppHeight = () => {
        html.style.setProperty('--app-height', window.innerHeight + 'px');
    };
    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 100));

    window.toggleMobileNav = function () {
        const nav = document.getElementById('main-nav');
        const btn = document.getElementById('nav-toggle');
        if (!nav) return;
        const open = nav.classList.toggle('nav-open');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.classList.toggle('nav-open', open);
    };

    document.addEventListener('click', (e) => {
        if (!body.classList.contains('nav-open')) return;
        const nav = document.getElementById('main-nav');
        const btn = document.getElementById('nav-toggle');
        if (nav && !nav.contains(e.target) && btn && !btn.contains(e.target)) {
            nav.classList.remove('nav-open');
            body.classList.remove('nav-open');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    });
})();
