// ── EKSTRAKSI TEKS ──
function extractText() {
    const title       = document.title || ''
    const meta        = document.querySelector('meta[name="description"]')?.content || ''
    const headings    = [...document.querySelectorAll('h1, h2, h3')]
                            .map(h => h.innerText).join(' ')
    const paragraphs  = [...document.querySelectorAll('p')]
                            .map(p => p.innerText.trim())
                            .filter(t => t.length > 10)   // buang paragraf terlalu pendek
                            .slice(0, 5)                  // ambil 5 paragraf pertama saja
                            .join(' ')
    const anchors     = [...document.querySelectorAll('a')]
                            .map(a => a.innerText).join(' ')

    return [title, meta, headings, paragraphs, anchors]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 512)  // batas token IndoBERT
}

// Kata kunci judol yang cukup dideteksi dari alt text / teks halaman
const JUDOL_KEYWORDS = [
    'slot gacor', 'maxwin', 'togel', 'judi online', 'situs judi',
    'daftar sekarang', 'bonus member', 'jackpot', 'scatter', 'withdraw',
    'rtp tertinggi', 'rtp tinggi', 'rtp slot', 'link alternatif', 'deposit',
    'bocoran slot', 'slot online', 'agen slot', 'agen togel', 'bandar togel',
    'bandar judi', 'casino online', 'pragmatic play', 'pg soft', 'habanero',
    'asupantoto', 'slot88', 'gacor77', 'olympus'
]

// Cek apakah teks mengandung kata kunci judol
function containsJudolKeyword(text) {
    if (!text) return false
    const lower = text.toLowerCase()
    return JUDOL_KEYWORDS.some(kw => lower.includes(kw))
}

// ── EKSTRAKSI GAMBAR (mendukung lazy-load & CSS sizing) ──
function extractImages() {
    const imgs = [...document.querySelectorAll('img, [data-src], [data-lazy], [data-lazy-src], [data-original]')]

    const result = []
    const seen   = new Set()

    for (const img of imgs) {
        // Ambil URL gambar — coba src asli, lalu atribut lazy-load
        const src = img.src ||
                    img.dataset.src ||
                    img.dataset.lazy ||
                    img.dataset.lazySrc ||
                    img.dataset.original || ''

        if (!src.startsWith('http')) continue
        if (seen.has(src))           continue
        if (src.includes('favicon')) continue

        // Filter logo/avatar kecuali namanya sangat jelas judol
        const altText = (img.alt || '').toLowerCase()
        const isObviouslyJudol = containsJudolKeyword(altText) || containsJudolKeyword(src)
        if (!isObviouslyJudol) {
            if (src.includes('logo') || src.includes('avatar')) continue
        }

        // Dimensi: coba naturalWidth → layout CSS → getBoundingClientRect
        let w = img.naturalWidth  || img.width
        let h = img.naturalHeight || img.height
        if ((!w || !h) && img.getBoundingClientRect) {
            const rect = img.getBoundingClientRect()
            w = w || Math.round(rect.width)
            h = h || Math.round(rect.height)
        }

        // Loloskan jika:
        // (a) dimensi cukup besar (sudah diketahui)
        // (b) ATAU alt text/src mengandung kata judol (prioritas tinggi)
        // (c) ATAU dimensi belum diketahui tapi URL terlihat seperti gambar konten
        const dimensiCukup  = w >= 100 && h >= 50
        const dimensiUnknown = w === 0 && h === 0
        const isContentImage = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(src)

        if (!dimensiCukup && !isObviouslyJudol && !( dimensiUnknown && isContentImage)) continue

        seen.add(src)
        result.push({
            src        : src,
            alt        : img.alt || '',
            w          : w,
            h          : h,
            altIsJudol : isObviouslyJudol
        })

        if (result.length >= 10) break  // maksimal 10 gambar
    }

    return result
}

// ── KONVERSI GAMBAR KE BASE64 (Melalui background script untuk bypass CORS) ──
async function imageUrlToBase64(url) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CONVERT_TO_BASE64', url: url }, (response) => {
            resolve(response && response.base64 ? response.base64 : null);
        });
    });
}

// ── CEK APAKAH HALAMAN INI ADALAH SEARCH ENGINE RESULTS PAGE (SERP) ──
function isSearchEnginePage() {
    const hostname = window.location.hostname.toLowerCase()
    const params   = new URLSearchParams(window.location.search)

    // Daftar domain search engine utama
    const searchDomains = [
        'google.com', 'google.co.id', 'google.co.uk', 'google.com.au',
        'bing.com',
        'search.yahoo.com', 'yahoo.com',
        'duckduckgo.com',
        'yandex.com', 'yandex.ru',
        'baidu.com',
        'ask.com',
        'ecosia.org',
        'search.brave.com',
        'startpage.com',
        'searx.me',
        'search.naver.com',
        'daum.net',
    ]

    // Cocokkan hostname (termasuk subdomain, misal www.google.com)
    const isSearchDomain = searchDomains.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
    )

    if (!isSearchDomain) return false

    // Hanya skip jika ada parameter query pencarian aktif
    const hasQuery = params.has('q') || params.has('query') ||
                     params.has('search') || params.has('text') ||
                     params.has('p') || params.has('wd')

    return hasQuery
}

// ── KIRIM DATA KE BACKGROUND ──
async function collectAndSend() {
    // Jangan scan halaman hasil pencarian (SERP) search engine
    if (isSearchEnginePage()) {
        console.log('[Judol Detector] Halaman search engine terdeteksi, scan dilewati.')
        return
    }

    const text   = extractText()
    const images = extractImages()

    // Prioritaskan gambar yang alt-nya mengandung kata judol, lalu urutkan dari terbesar
    const sorted = images.sort((a, b) => {
        if (a.altIsJudol && !b.altIsJudol) return -1
        if (!a.altIsJudol && b.altIsJudol) return 1
        return (b.w * b.h) - (a.w * a.h)
    })
    const top3Images = sorted.slice(0, 3)

    // Konversi ketiga gambar ke base64 secara paralel
    const base64Promises = top3Images.map(img => imageUrlToBase64(img.src))
    const base64Results  = await Promise.all(base64Promises)
    const validBase64s   = base64Results.filter(b64 => b64 !== null)

    chrome.runtime.sendMessage({
        type     : 'PAGE_DATA',
        url      : window.location.href,
        text     : text,
        mainImage: validBase64s[0] || null, // Untuk backward compatibility
        images   : validBase64s,            // List base64 dari 3 gambar terbesar
        allImages: images.map(img => img.src)
    }).catch(err => {
        console.warn('[Judol Detector] Gagal mengirim PAGE_DATA ke background script:', err.message);
    });
}

// ── STATE ──
let isPageJudol = false;

// ── TERIMA PESAN DARI BACKGROUND/POPUP ──
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PAGE_RESULT') {
        isPageJudol = message.result.is_judol;
        if (isPageJudol) {
            showFloatingWarning(message.result)
            chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
                if (data.isActive && data.sensorActive) {
                    scanAndBlurImages();
                }
            });
        }
    }

    if (message.type === 'SHOW_WARNING') { // Fallback if still sent
        isPageJudol = true;
        showFloatingWarning(message.result)
    }

    if (message.type === 'START_SENSOR_SCAN') {
        if (isPageJudol) scanAndBlurImages()
    }

    if (message.type === 'TOGGLE_SENSOR') {
        if (!message.active) {
            removeAllBlur()
        } else {
            if (isPageJudol) scanAndBlurImages()
        }
    }

    if (message.type === 'TOGGLE_EXTENSION') {
        if (!message.active) {
            // Hapus banner warning jika ada
            const warningBanner = document.getElementById('judol-warning-banner');
            if (warningBanner) warningBanner.remove();
            
            // Hapus semua blur
            removeAllBlur();
            isPageJudol = false; // Reset state
        } else {
            // Jalankan ulang deteksi halaman
            collectAndSend();
        }
    }
})

// ── TAMPILKAN WARNING FLOATING DI HALAMAN ──
function showFloatingWarning(result) {
    // Jika sudah ada banner, jangan buat lagi (mencegah race condition)
    const existing = document.getElementById('judol-warning-banner');
    if (existing) return;

    const pct       = (v) => Math.round(v * 100);
    const pctFinal  = pct(result.final_confidence);
    const pctImage  = pct(result.confidence_image);
    const pctText   = pct(result.confidence_text);
    const pctFusion = pct(result.confidence_fusion);

    // ── helper: buat baris skor ──────────────────────────────────
    function scoreRow(label, value, color, height) {
        return `
        <div style="display:flex !important; flex-direction:column !important; gap:5px !important;">
            <div style="display:flex !important; justify-content:space-between !important; align-items:center !important;">
                <span style="font-size:12px !important; font-weight:500 !important; color:#444 !important; font-family:inherit !important;">${label}</span>
                <span style="font-size:12px !important; font-weight:700 !important; color:${color} !important; font-family:inherit !important;">${value}%</span>
            </div>
            <div style="height:${height}px !important; background:#ebebeb !important; border-radius:3px !important; overflow:hidden !important;">
                <div style="height:100% !important; width:${value}% !important; background:${color} !important; border-radius:3px !important;"></div>
            </div>
        </div>`;
    }

    // URL logo harus dihitung sebelum masuk ke innerHTML
    const logoUrl = chrome.runtime.getURL('icons/Icon_JD.png');

    const overlay = document.createElement('div');
    overlay.id = 'judol-warning-banner';
    overlay.style.cssText = `
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0,0,0,0.45) !important;
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif !important;
        box-sizing: border-box !important;
        padding: 20px !important;
        opacity: 0 !important;
        transition: opacity 0.2s ease !important;
    `;

    overlay.innerHTML = `
        <style>
            #jd-card * { box-sizing: border-box !important; }
            #jd-close:hover  { background: #f0f0f0 !important; color: #111 !important; }
            #jd-btn-block:hover   { opacity: 0.88 !important; transform: translateY(-1px) !important; }
            #jd-btn-report:hover  { opacity: 0.88 !important; transform: translateY(-1px) !important; }
            #jd-btn-continue:hover { color: #555 !important; }
            #jd-btn-block:active, #jd-btn-report:active, #jd-btn-continue:active { transform: translateY(0) !important; }
        </style>

        <div id="jd-card" style="
            position: relative !important;
            background: #ffffff !important;
            border: 1px solid #e4e4e4 !important;
            border-radius: 16px !important;
            width: 360px !important;
            max-width: 100% !important;
            overflow: hidden !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.14) !important;
            color: #111 !important;
            font-family: inherit !important;
        ">
            <!-- Tombol tutup -->
            <button id="jd-close" style="
                position: absolute !important;
                top: 12px !important;
                right: 12px !important;
                width: 26px !important;
                height: 26px !important;
                background: transparent !important;
                border: none !important;
                border-radius: 6px !important;
                font-size: 14px !important;
                color: #999 !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: background 0.15s, color 0.15s !important;
                outline: none !important;
                font-family: inherit !important;
                line-height: 1 !important;
            ">✕</button>

            <!-- Banner merah atas -->
            <div style="
                background: #fff5f5 !important;
                border-bottom: 1px solid #ffc9c9 !important;
                padding: 14px 16px 12px !important;
                display: flex !important;
                align-items: flex-start !important;
                gap: 10px !important;
            ">
                <img src="${logoUrl}" style="
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 6px !important;
                    object-fit: contain !important;
                    flex-shrink: 0 !important;
                " alt="Judol Detector">
                <div>
                    <div style="font-size:13px !important; font-weight:700 !important; color:#c92a2a !important; font-family:inherit !important; margin-bottom:3px !important;">Terdeteksi Konten Promosi Judi Online</div>
                    <div style="font-size:12px !important; color:#aa2222 !important; font-family:inherit !important;">Tingkat keyakinan: <strong style="font-family:inherit !important;">${pctFinal}%</strong></div>
                </div>
            </div>

            <!-- Skor analisis -->
            <div style="padding: 14px 16px !important; border-bottom: 1px solid #e4e4e4 !important; display:flex !important; flex-direction:column !important; gap:10px !important;">
                <div style="font-size:10px !important; font-weight:700 !important; letter-spacing:0.07em !important; text-transform:uppercase !important; color:#999 !important; font-family:inherit !important; margin-bottom:2px !important;">Hasil Deteksi Halaman</div>
                ${scoreRow('Analisis Gambar', pctImage,  '#1a56db', 4)}
                ${scoreRow('Analisis Teks',   pctText,   '#1a56db', 4)}
                ${scoreRow('Analisis Fusion', pctFusion, '#1a56db', 4)}
                <div style="height:1px !important; background:#e4e4e4 !important; margin:2px 0 !important;"></div>
                ${scoreRow('Skor Akhir', pctFinal, '#c92a2a', 5)}
            </div>

            <!-- Tombol aksi -->
            <div style="padding: 12px 16px 16px !important; display:flex !important; flex-direction:column !important; gap:7px !important;">
                <button id="jd-btn-block" style="
                    width:100% !important; padding:10px 16px !important; border:none !important; border-radius:8px !important;
                    background:#c92a2a !important; color:white !important;
                    font-size:13px !important; font-weight:600 !important; cursor:pointer !important;
                    transition: opacity 0.15s, transform 0.1s !important;
                    outline:none !important; font-family:inherit !important; line-height:1 !important;
                ">Blokir Situs Ini</button>
                <button id="jd-btn-report" style="
                    width:100% !important; padding:10px 16px !important; border:1px solid #cccccc !important; border-radius:8px !important;
                    background:white !important; color:#444 !important;
                    font-size:13px !important; font-weight:600 !important; cursor:pointer !important;
                    transition: opacity 0.15s, transform 0.1s !important;
                    outline:none !important; font-family:inherit !important; line-height:1 !important;
                ">Laporkan ke Komdigi</button>
                <button id="jd-btn-continue" style="
                    width:100% !important; padding:8px 16px !important; border:none !important; border-radius:8px !important;
                    background:transparent !important; color:#999 !important;
                    font-size:12px !important; font-weight:500 !important; cursor:pointer !important;
                    transition: color 0.15s !important;
                    outline:none !important; font-family:inherit !important; line-height:1 !important;
                ">Lanjut Akses Situs</button>
            </div>
        </div>

        <style>
            @keyframes jd-blink {
                0%, 100% { opacity: 1; }
                50%       { opacity: 0.2; }
            }
        </style>
    `;

    // ── Event listeners ──────────────────────────────────────────
    const dismiss = () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 200);
    };

    overlay.querySelector('#jd-close').addEventListener('click', dismiss);

    overlay.querySelector('#jd-btn-continue').addEventListener('click', () => {
        dismiss();
        scanAndBlurImages();
    });

    overlay.querySelector('#jd-btn-block').addEventListener('click', () => {
        const hostname = window.location.hostname;
        // Simpan ke blocklist dulu (async, tidak perlu tunggu)
        chrome.runtime.sendMessage({ type: 'BLOCK_SITE', url: hostname });
        // Langsung redirect tanpa tunggu callback
        window.location.replace(
            chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(hostname)}`)
        );
    });

    overlay.querySelector('#jd-btn-report').addEventListener('click', () => {
        window.open('https://aduankonten.id/', '_blank');
    });

    document.body.prepend(overlay);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    });
}

// ── SCAN SEMUA GAMBAR & BLUR YANG TERDETEKSI JUDOL ──
async function scanAndBlurImages() {
    // Pastikan ekstensi aktif dan sensor aktif, DAN halaman adalah judol
    if (!isPageJudol) return;

    const storage = await new Promise(resolve => {
        chrome.storage.local.get(['isActive', 'sensorActive'], resolve);
    });
    if (!storage.isActive || !storage.sensorActive) {
        return;
    }

    const images = extractImages()  // Gunakan fungsi yang sudah diperbaiki

    for (const imgData of images) {
        // Cari elemen <img> yang sesuai di DOM
        const imgEl = document.querySelector(
            `img[src="${CSS.escape(imgData.src)}"],` +
            `img[data-src="${CSS.escape(imgData.src)}"],` +
            `img[data-lazy="${CSS.escape(imgData.src)}"]`
        ) || [...document.querySelectorAll('img')].find(
            el => (el.src || el.dataset.src || '') === imgData.src
        )

        if (!imgEl) continue

        try {
            // JALUR CEPAT: Jika alt text / URL sudah mengandung kata judol, langsung blur
            if (imgData.altIsJudol) {
                blurElement(imgEl)
                continue
            }

            const base64 = await imageUrlToBase64(imgData.src)
            if (!base64) continue

            // Proxy request ke background script untuk menghindari peringatan Local Network Access (LNA) di browser
            const result = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'PREDICT_IMAGE', base64: base64 }, response => {
                    resolve(response || { is_judol: false })
                })
            })

            if (result.is_judol) {
                blurElement(imgEl)
            }
        } catch (e) {
            // skip gambar yang tidak bisa diproses
        }
    }

    // Blur teks yang mengandung kata kunci judol
    blurJudolText()
}

// ── BLUR GAMBAR ──
function blurElement(el) {
    // Jangan blur elemen yang ada di dalam overlay warning kita sendiri
    if (document.getElementById('judol-warning-banner')?.contains(el)) return

    if (el.dataset.judolBlurred === "true") return;
    el.dataset.judolBlurred = "true";
    el.style.filter     = 'blur(12px) grayscale(100%)'
    el.style.transition = 'filter 0.3s'

    // Tambah overlay label
    const wrapper = document.createElement('div')
    wrapper.dataset.judolWrapper = "true";
    wrapper.style.cssText = `
        position: relative; display: inline-block;
    `
    const label = document.createElement('div')
    label.textContent = '🚫 Konten Disensor'
    label.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.7); color: white;
        padding: 4px 10px; border-radius: 4px;
        font-size: 12px; pointer-events: none; z-index: 10;
    `
    el.parentNode.insertBefore(wrapper, el)
    wrapper.appendChild(el)
    wrapper.appendChild(label)
}

// ── BLUR TEKS JUDOL (kata kunci) ──
function blurJudolText() {
    const keywords = JUDOL_KEYWORDS

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
    )

    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)

    nodes.forEach(node => {
        // Jangan blur teks yang ada di dalam overlay warning kita sendiri
        if (node.parentElement && document.getElementById('judol-warning-banner')?.contains(node.parentElement)) return

        const text  = node.textContent.toLowerCase()
        const found = keywords.some(kw => text.includes(kw))

        if (found && node.parentElement) {
            if (node.parentElement.dataset.judolTextBlurred === "true") return;
            node.parentElement.dataset.judolTextBlurred = "true";
            node.parentElement.style.filter = 'blur(4px)'
            node.parentElement.title        = 'Konten disensor oleh Judol Detector'
        }
    })
}

// ── HAPUS SEMUA BLUR ──
function removeAllBlur() {
    // 1. Kembalikan gambar yang di-blur dan di-wrap
    const blurredImages = document.querySelectorAll('[data-judol-blurred="true"]');
    blurredImages.forEach(el => {
        el.style.filter = '';
        el.style.transition = '';
        delete el.dataset.judolBlurred;

        // Cek apakah dibungkus oleh wrapper sensor
        const wrapper = el.parentNode;
        if (wrapper && wrapper.dataset.judolWrapper === "true") {
            const originalParent = wrapper.parentNode;
            if (originalParent) {
                // Kembalikan gambar ke tempat asalnya sebelum wrapper
                originalParent.insertBefore(el, wrapper);
                // Hapus wrapper beserta label sensor di dalamnya
                wrapper.remove();
            }
        }
    });

    // 2. Kembalikan teks yang di-blur
    const blurredTexts = document.querySelectorAll('[data-judol-text-blurred="true"]');
    blurredTexts.forEach(el => {
        el.style.filter = '';
        if (el.title === 'Konten disensor oleh Judol Detector') {
            el.removeAttribute('title');
        }
        delete el.dataset.judolTextBlurred;
    });
}

// ── OBSERVER: Tangkap gambar yang dimuat secara dinamis (lazy load / infinite scroll) ──
let _observerActive = false
function startImageObserver() {
    if (_observerActive) return
    _observerActive = true

    const observer = new MutationObserver(() => {
        if (!isPageJudol) return;
        chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
            if (data.isActive && data.sensorActive && !isSearchEnginePage()) {
                // Debounce agar tidak terlalu sering scan
                clearTimeout(window._judolObserverTimer)
                window._judolObserverTimer = setTimeout(() => {
                    scanAndBlurImages()
                }, 800)
            }
        })
    })

    observer.observe(document.body, {
        childList : true,
        subtree   : true,
        attributes: true,
        attributeFilter: ['src', 'data-src', 'data-lazy', 'data-lazy-src', 'data-original']
    })

    console.log('[Judol Detector] MutationObserver aktif — memantau gambar dinamis.')
}

// Jalankan pengumpulan data saat halaman selesai load
chrome.storage.local.get(['isActive'], (data) => {
    if (data.isActive !== false) {
        collectAndSend()
        // Coba lagi setelah 2 detik untuk gambar yang lambat load
        setTimeout(() => {
            chrome.storage.local.get(['isActive'], (d) => {
                if (d.isActive !== false) collectAndSend()
            })
        }, 2000)
    }
})

// Cek status global dan inisialisasi observer
chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
    if (data.isActive && data.sensorActive && !isSearchEnginePage()) {
        // Observer aktif sejak awal, tapi hanya akan memproses jika isPageJudol = true
        startImageObserver()
    }
})
