// Lucide icons
lucide.createIcons();

// Navbar border on scroll
const nav = document.getElementById('siteNav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 16);
}, { passive: true });

// Smooth scroll untuk anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const y = target.getBoundingClientRect().top + window.scrollY - 68;
        window.scrollTo({ top: y, behavior: 'smooth' });
    });
});

// ── Feature video: autoplay loop always + lightbox on click (no controls) ──
document.querySelectorAll('.feature').forEach(card => {
    const vid = card.querySelector('.feature-video');
    if (!vid) return;

    vid.autoplay = true;
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.play().catch(() => {});

    card.addEventListener('click', () => {
        const lb = document.createElement('div');
        lb.className = 'fv-lightbox';

        const lbVid = document.createElement('video');
        lbVid.src = vid.src;
        lbVid.autoplay = true;
        lbVid.loop = true;
        lbVid.muted = true;
        lbVid.playsInline = true;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fv-lightbox-close';
        closeBtn.innerHTML = '\u2715';
        closeBtn.setAttribute('aria-label', 'Tutup');

        lb.appendChild(lbVid);
        lb.appendChild(closeBtn);
        document.body.appendChild(lb);
        document.body.style.overflow = 'hidden';
        lbVid.play().catch(() => {});

        const closeLb = () => {
            lbVid.pause();
            lb.style.animation = 'fv-fadein 0.15s ease reverse forwards';
            setTimeout(() => { lb.remove(); document.body.style.overflow = ''; }, 150);
        };

        closeBtn.addEventListener('click', closeLb);
        lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
        const onKey = e => {
            if (e.key === 'Escape') { closeLb(); document.removeEventListener('keydown', onKey); }
        };
        document.addEventListener('keydown', onKey);
    });
});

// ── Steps card stack ──
(function () {
    const cards   = Array.from(document.querySelectorAll('.ck-card'));
    const dots    = Array.from(document.querySelectorAll('.ck-dot'));
    const stage   = document.querySelector('.ck-stack');
    if (!cards.length || !stage) return;

    const total      = cards.length;
    let current      = 0;
    const AUTO_MS    = 3500;
    let autoTimer    = null;
    const PEEK       = 22;
    const SCALE_STEP = 0.035;

    function setHeight() {
        const h = cards[current].offsetHeight;
        if (h > 0) stage.style.height = (h + PEEK * 2) + 'px';
    }

    function layout(animated) {
        cards.forEach((card, i) => {
            const pos = ((i - current) % total + total) % total;
            card.style.transition = animated
                ? 'transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.45s ease'
                : 'none';

            if (pos === 0) {
                card.style.zIndex        = total;
                card.style.opacity       = '1';
                card.style.transform     = 'translateY(0) scale(1)';
                card.style.pointerEvents = 'auto';
            } else if (pos === 1) {
                card.style.zIndex        = total - 1;
                card.style.opacity       = '0.85';
                card.style.transform     = 'translateY(' + PEEK + 'px) scale(' + (1 - SCALE_STEP) + ')';
                card.style.pointerEvents = 'none';
            } else if (pos === 2) {
                card.style.zIndex        = total - 2;
                card.style.opacity       = '0.5';
                card.style.transform     = 'translateY(' + Math.round(PEEK * 1.7) + 'px) scale(' + (1 - SCALE_STEP * 2) + ')';
                card.style.pointerEvents = 'none';
            } else {
                card.style.zIndex        = '0';
                card.style.opacity       = '0';
                card.style.transform     = 'translateY(' + Math.round(PEEK * 2.4) + 'px) scale(' + (1 - SCALE_STEP * 3) + ')';
                card.style.pointerEvents = 'none';
            }
        });

        dots.forEach((d, i) => d.classList.toggle('active', i === current));

        if (animated) {
            setTimeout(setHeight, 460);
        } else {
            setHeight();
        }
    }

    function next()      { current = (current + 1) % total; layout(true); }
    function goTo(idx)   { current = ((idx % total) + total) % total; layout(true); }
    function startAuto() { stopAuto(); autoTimer = setInterval(next, AUTO_MS); }
    function stopAuto()  { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
    function resetAuto() { stopAuto(); setTimeout(startAuto, 5000); }

    // Wait for images before first layout so offsetHeight is correct
    const imgs    = Array.from(stage.querySelectorAll('img'));
    let   pending = imgs.filter(img => !img.complete).length;

    function tryInit() {
        pending--;
        if (pending <= 0) layout(false);
    }

    if (pending === 0) {
        layout(false);
    } else {
        imgs.forEach(img => {
            if (!img.complete) {
                img.addEventListener('load',  tryInit);
                img.addEventListener('error', tryInit);
            }
        });
    }

    cards.forEach(card => card.addEventListener('click', () => { next(); resetAuto(); }));
    dots.forEach(d => d.addEventListener('click', () => { goTo(+d.dataset.idx); resetAuto(); }));

    let startY = 0;
    stage.addEventListener('touchstart', e => { startY = e.touches[0].clientY; stopAuto(); }, { passive: true });
    stage.addEventListener('touchend', e => {
        if (startY - e.changedTouches[0].clientY > 40) next();
        resetAuto();
    });

    let startYm = 0, dragging = false;
    stage.addEventListener('mousedown', e => { dragging = true; startYm = e.clientY; stopAuto(); });
    stage.addEventListener('mouseup', e => {
        if (!dragging) return;
        dragging = false;
        if (startYm - e.clientY > 40) next();
        resetAuto();
    });
    stage.addEventListener('mouseleave', () => { dragging = false; });

    window.addEventListener('resize', setHeight, { passive: true });
    startAuto();
})();

// ── Hero typewriter ──
(function () {
    const el     = document.getElementById('hero-typewriter');
    const cursor = document.querySelector('.typewriter-cursor');
    if (!el || !cursor) return;

    const text  = 'Judol Detector memindai setiap halaman yang Anda buka dan memberi peringatan saat menemukan promosi judi online berupa teks maupun gambar.';
    const speed = 28;
    const delay = 600;

    el.parentElement.style.minHeight = 'calc(16px * 1.7 * 3)';

    let i = 0;
    function type() {
        if (i < text.length) {
            el.textContent += text[i++];
            setTimeout(type, speed);
        }
    }
    setTimeout(type, delay);
})();

// ── Intro splash animation ──
(function () {
    const overlay = document.getElementById('intro-overlay');
    const logo    = document.getElementById('intro-logo');
    const navLogo = document.getElementById('nav-logo');
    if (!overlay || !logo || !navLogo) return;

    document.body.style.overflow = 'hidden';
    navLogo.style.opacity    = '0';
    navLogo.style.transition = 'none';

    const nr    = navLogo.getBoundingClientRect();
    const nCx   = nr.left + nr.width  / 2;
    const nCy   = nr.top  + nr.height / 2;
    const vCx   = window.innerWidth  / 2;
    const vCy   = window.innerHeight / 2;
    const scale = nr.width / 72;
    const dx    = nCx - vCx;
    const dy    = nCy - vCy;

    const T_FADE = 350;
    const T_SPIN = 650;
    const T_FLY  = 800;
    const T_WAIT = 120;
    const T_RISE = 500;

    setTimeout(() => {
        logo.style.transition = 'opacity ' + T_FADE + 'ms ease';
        logo.style.opacity    = '1';
    }, 80);

    const t2 = 80 + T_FADE + 80;
    setTimeout(() => {
        logo.style.transition = 'transform ' + T_SPIN + 'ms cubic-bezier(0.4,0,0.2,1)';
        logo.style.transform  = 'translate(-50%,-50%) rotate(360deg)';
    }, t2);

    const t3 = t2 + T_SPIN + 60;
    setTimeout(() => {
        logo.style.transition = 'transform ' + T_FLY + 'ms cubic-bezier(0.4,0,0.6,1)';
        logo.style.transform  = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) rotate(360deg) scale(' + scale + ')';
    }, t3);

    const t4 = t3 + T_FLY + T_WAIT;
    setTimeout(() => {
        logo.style.transition = 'opacity 80ms';
        logo.style.opacity    = '0';

        overlay.style.transition = 'transform ' + T_RISE + 'ms linear';
        overlay.style.transform  = 'translateY(-100%)';

        navLogo.style.opacity  = '1';
        navLogo.style.clipPath = 'inset(100% 0 0 0)';

        const t0 = performance.now();
        function wipe(now) {
            const pct    = Math.min((now - t0) / T_RISE, 1);
            const bottom = window.innerHeight * (1 - pct);
            if (bottom <= nr.bottom) {
                const revealed = Math.min((nr.bottom - bottom) / nr.height, 1);
                navLogo.style.clipPath = 'inset(' + ((1 - revealed) * 100) + '% 0 0 0)';
            }
            if (pct < 1) requestAnimationFrame(wipe);
            else navLogo.style.clipPath = 'none';
        }
        requestAnimationFrame(wipe);
    }, t4);

    setTimeout(() => {
        overlay.remove();
        logo.remove();
        document.body.style.overflow = '';
    }, t4 + T_RISE + 60);
})();

// ── Word reveal on scroll ──
(function () {
    document.querySelectorAll('h2.reveal-words').forEach(h2 => {
        // Wrap each word in a span
        h2.innerHTML = h2.textContent
            .split(/(\s+)/)
            .map(part => part.trim()
                ? '<span class="word">' + part + '</span>'
                : part)
            .join('');

        const words = Array.from(h2.querySelectorAll('.word'));

        const obs = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            obs.unobserve(h2);

            // Shuffle order for random reveal
            const order = words.map((_, i) => i);
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }

            order.forEach((wordIdx, step) => {
                const delay = step * 60; // ms between each word
                setTimeout(() => {
                    words[wordIdx].style.transitionDelay = '0ms';
                    words[wordIdx].style.opacity = '1';
                    words[wordIdx].style.transform = 'translateY(0)';
                }, delay);
            });

            h2.classList.add('revealed');
        }, { threshold: 0.3 });

        obs.observe(h2);
    });
})();

// ── Logo spin + grow on scroll ──
(function () {
    const logo = document.querySelector('.scroll-spin-grow');
    if (!logo) return;

    const obs = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        obs.unobserve(logo);
        logo.classList.add('spin-done');
    }, { threshold: 0.4 });

    obs.observe(logo);
})();
