// ── GUARD: Cegah double injection (saat popup inject manual ke tab yang sudah punya content script) ──
// Gunakan window property (bukan let) agar bisa dicek sebelum script dieksekusi ulang
if (window.__judolDetectorInjected) {
    // Script sudah pernah di-inject, jangan jalankan ulang
} else {
    window.__judolDetectorInjected = true;

    // ── GLOBAL CLICK BLOCKER ──
    // Mencegah semua klik, sentuhan, dan tombol enter/spasi pada elemen yang disensor
    // sehingga user tidak bisa mengklik link atau tombol yang sudah disensor.
    // Menggunakan fase capture (true) agar berjalan sebelum event listener bawaan website.
    const blockCensoredEvents = (e) => {
        let target = e.target
        while (target && target !== document) {
            const isBlurred =
                target.dataset.judolTextBlurred === 'true' ||
                target.dataset.judolBlurred === 'true' ||
                target.dataset.judolWrapper === 'true' ||
                target.dataset.judolImageOverlay === 'true' ||
                target.style.filter?.includes('blur')

            if (isBlurred) {
                e.preventDefault()
                e.stopPropagation()
                e.stopImmediatePropagation()
                return false
            }
            target = target.parentNode
        }
    }

    // Daftarkan event blocker pada fase capture
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keypress'].forEach(evtName => {
        document.addEventListener(evtName, blockCensoredEvents, true)
    })

    // ── LOADING INDICATOR ──
    // Menampilkan indikator loading kecil di pojok kanan bawah saat deteksi berlangsung
    let _loadingIndicator = null

    function showLoadingIndicator() {
        // Sembunyikan server down indicator agar tidak bertumpuk
        hideServerDownIndicator()

        // Jangan tampilkan jika sudah ada
        if (_loadingIndicator) return

        _loadingIndicator = document.createElement('div')
        _loadingIndicator.id = 'judol-loading-indicator'
        _loadingIndicator.innerHTML = `
        <style>
            #judol-loading-indicator {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #ffffff;
                padding: 10px 16px;
                border-radius: 8px;
                font-family: 'Nohemi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12);
                z-index: 2147483647;
                animation: judol-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid #e4e4e4;
            }
            #judol-loading-indicator .text {
                font-weight: 600;
                font-size: 12px;
                color: #111111;
                white-space: nowrap;
            }
            #judol-loading-indicator .spinner {
                width: 14px;
                height: 14px;
                border: 2px solid #e4e4e4;
                border-top-color: #070707;
                border-radius: 50%;
                animation: judol-spin 0.7s linear infinite;
            }
            @keyframes judol-spin {
                to { transform: rotate(360deg); }
            }
            @keyframes judol-slide-in {
                from {
                    opacity: 0;
                    transform: translateY(16px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            @keyframes judol-slide-out {
                from {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                to {
                    opacity: 0;
                    transform: translateY(16px) scale(0.96);
                }
            }
        </style>
        <span class="text">Mendeteksi konten...</span>
        <div class="spinner"></div>
    `
        document.body.appendChild(_loadingIndicator)

        // Safety timeout: sembunyikan loading setelah 65 detik
        // Harus LEBIH LAMA dari total waktu retry maksimal di background.js:
        // Maximum retry = 3 attempts × 12s timeout + 2 delays × 12s = 60 detik
        // 65 detik = buffer 5s agar loading tidak hilang duluan sebelum API_DOWN diterima
        setTimeout(() => hideLoadingIndicator(), 65000)
    }

    function hideLoadingIndicator() {
        if (!_loadingIndicator) return

        // Animasi keluar
        _loadingIndicator.style.animation = 'judol-slide-out 0.3s ease-out forwards'
        setTimeout(() => {
            if (_loadingIndicator && _loadingIndicator.parentNode) {
                _loadingIndicator.parentNode.removeChild(_loadingIndicator)
            }
            _loadingIndicator = null
        }, 300)
    }

    // ── SERVER DOWN INDICATOR ──
    // Ditampilkan ketika API gagal setelah semua retry (server sedang cold start / down)
    let _serverDownIndicator = null

    function showServerDownIndicator() {
        // Sembunyikan loading indicator dulu
        hideLoadingIndicator()

        // Jangan tampilkan jika sudah ada
        if (_serverDownIndicator) return

        _serverDownIndicator = document.createElement('div')
        _serverDownIndicator.id = 'judol-server-down'
        _serverDownIndicator.innerHTML = `
        <style>
            #judol-server-down {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #ffffff;
                padding: 10px 12px 10px 16px;
                border-radius: 8px;
                font-family: 'Nohemi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12);
                z-index: 2147483647;
                animation: judol-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid #ffc9c9;
            }
            #judol-server-down .sd-text {
                font-weight: 600;
                font-size: 12px;
                color: #c92a2a;
                white-space: nowrap;
            }
            #judol-server-down .sd-close {
                width: 20px;
                height: 20px;
                border: none;
                background: transparent;
                color: #999;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                padding: 0;
                line-height: 1;
                transition: background 0.15s, color 0.15s;
            }
            #judol-server-down .sd-close:hover {
                background: #f0f0f0;
                color: #333;
            }
            @keyframes judol-slide-in {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes judol-slide-out {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to   { opacity: 0; transform: translateY(16px) scale(0.96); }
            }
        </style>
        <span class="sd-text">Server sedang tidak tersedia</span>
        <button class="sd-close" title="Tutup">✕</button>
    `
        document.body.appendChild(_serverDownIndicator)

        // Event listener tombol close
        _serverDownIndicator.querySelector('.sd-close').addEventListener('click', () => {
            hideServerDownIndicator()
        })

        // Auto-hide setelah 30 detik
        setTimeout(() => hideServerDownIndicator(), 30000)
    }

    function hideServerDownIndicator() {
        if (!_serverDownIndicator) return
        _serverDownIndicator.style.animation = 'judol-slide-out 0.3s ease-out forwards'
        setTimeout(() => {
            if (_serverDownIndicator && _serverDownIndicator.parentNode) {
                _serverDownIndicator.parentNode.removeChild(_serverDownIndicator)
            }
            _serverDownIndicator = null
        }, 300)
    }

    // ── EKSTRAKSI TEKS ──

    // Kata-kata yang sering menyebabkan false positive pada model teks.
    // Kata-kata ini DIHAPUS dari teks yang dikirim ke API untuk deteksi,
    // tapi TIDAK mempengaruhi fitur blur/sensor (sensor tetap blur berdasarkan keyword seperti biasa).
    const DETECTION_WHITELIST = [
        'situs',
        'judi online',
        'judol',
        'daftar',
        'login',
        'poker',
        'deposit',
        'withdraw',
        'link alternatif',
        'judi',
        'sign in',
        'sign up',
        'masuk',
        'domino',
        'kartu',
        'card',
        'cards',
        'simulator',
        'tcg',
        'pack',
        'game',
        'shop',
        'olahraga',
        'capsa',
        'sepak bola',
        'akun',
        'account',
        'pengguna',
        'username',
        'logout',
        'register',
        'signin',
        'signup'
    ]

    // Hapus kata whitelist dari teks agar tidak membingungkan model saat deteksi
    function stripWhitelistForDetection(text) {
        if (!text) return text
        let cleaned = text
        // Urutkan dari yang terpanjang dulu agar "judi online" terhapus sebelum "judi"
        const sorted = [...DETECTION_WHITELIST].sort((a, b) => b.length - a.length)
        for (const word of sorted) {
            // Hapus kata sebagai whole word (case-insensitive), pakai word boundary
            const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi')
            cleaned = cleaned.replace(regex, '')
        }
        // Rapikan spasi berlebih setelah penghapusan
        return cleaned.replace(/\s+/g, ' ').trim()
    }

    function extractText() {
        const title = document.title || ''
        const meta = document.querySelector('meta[name="description"]')?.content || ''
        const headings = [...document.querySelectorAll('h1, h2, h3')]
            .map(h => h.innerText).join(' ')
        const paragraphs = [...document.querySelectorAll('p')]
            .map(p => p.innerText.trim())
            .filter(t => t.length > 10)   // buang paragraf terlalu pendek
            .slice(0, 15)                 // ambil 15 paragraf pertama
            .join(' ')

        // Ambil teks dari semua anchor: teks visible + href (untuk deteksi slug/domain judol)
        const anchors = [...document.querySelectorAll('a')]
            .map(a => {
                const text = (a.innerText || a.textContent || '').trim()
                const href = a.getAttribute('href') || ''
                return [text, href].filter(Boolean).join(' ')
            })
            .join(' ')

        // Teks dari elemen inline yang sering dipakai banner judol: <b>, <strong>, <span>, <em>
        const inlineText = [...document.querySelectorAll('b, strong, span, em')]
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(t => t.length > 2)
            .slice(0, 60)
            .join(' ')

        // Teks dari tombol / elemen CTA (class mengandung btn, button, cta, register, login, daftar)
        const ctaText = [...document.querySelectorAll(
            '[class*="btn"], [class*="button"], [class*="cta"], ' +
            '[class*="register"], [class*="login"], [class*="daftar"]'
        )]
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(t => t.length > 2)
            .slice(0, 30)
            .join(' ')

        // Batas 2500 karakter ≈ 512 token IndoBERT (1 token ≈ 4-5 karakter untuk teks Indonesia)
        // Backend tokenizer akan truncate di 512 token, jadi kirim teks secukupnya agar model
        // mendapat konteks maksimal tanpa membuang informasi penting.
        return stripWhitelistForDetection(
            [title, meta, headings, paragraphs, anchors, inlineText, ctaText]
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 2500)
        )
    }

    // Kata kunci judol yang cukup dideteksi dari alt text / teks halaman
    const JUDOL_KEYWORDS = [
        'slot gacor', 'slot 88', 'slot88', 'gacor77', 'gacor 77',
        'maxwin', 'max win',
        'togel', 'situs judi',
        'daftar sekarang', 'bonus member', 'jackpot', 'scatter', 'withdraw',
        'rtp tertinggi', 'rtp', 'rtp tinggi', 'rtp slot', 'link alternatif',
        'bocoran slot', 'slot online', 'agen slot', 'agen togel', 'bandar togel',
        'bandar judi', 'casino online', 'pragmatic play', 'pg soft', 'habanero',
        'asupantoto', 'olympus',
        // Kata kunci CTA tombol judol yang umum
        'register', 'gabung', 'join now', 'play now',
        'cuanbet', 'bet88', 'spin', 'livechat', 'live chat',
        // Nama domain / slug yang sering dipakai situs judol
        'cerger', 'judislot', 'slotbet', 'casinobet', 'togelbos',
        // Tambahan: istilah gambling umum
        'sportsbook', 'live casino', 'livecasino', 'taruhan', 'bertaruh',
        'kasino', 'keno', 'rng', 'bandar', 'bookie', 'odds', 'wager',
        'poker online', 'domino', 'capsa', 'bola online', 'sbobet',
        'gacor', 'slot', 'judi', 'casino', 'bet',
        // Brand/ nama situs judol populer
        'kakek303', 'kakek 303', 'gacor69', 'gacor 69', 'slot88', 'slot 88',
        'olympus88', 'zeus88', 'starlight', 'gates of olympus', 'sweet bonanza',
        'mahjong ways', 'lucky neko', 'wild west gold',
        // Tambahan keyword dari request user
        'sabung ayam'
    ]

    // Keyword tunggal — hanya dipakai untuk cek alt text & src gambar (lebih agresif dari JUDOL_KEYWORDS)
    // Tidak dipakai untuk teks halaman umum agar menghindari false positive
    const JUDOL_IMAGE_KEYWORDS = [
        'slot', 'gacor', 'togel', 'maxwin', 'jackpot', 'scatter',
        'casino', 'judi', 'bet', 'rtp', 'spin', 'poker',
        'pragmatic', 'pgsoft', 'habanero', 'olympus', 'demo slot'
    ]

    // Kata kunci yang khusus dicek di URL/href anchor (lebih agresif)
    const JUDOL_HREF_KEYWORDS = [
        'slot', 'togel', 'casino', 'bet', 'gacor', 'maxwin', 'judol',
        'judi', 'poker', 'spin', 'jackpot', 'scatter', 'rtp'
    ]

    // Kata yang diwhitelist — teks yang hanya mengandung ini TIDAK dianggap judol
    // (misal: halaman berita tentang judol, atau nama aplikasi "Judol Detector")
    const JUDOL_WHITELIST_EXACT = [
        'judol', 'judol detector', 'judi online', 'anti judol', 'anti judi online',
        'deteksi judol', 'deteksi judi online', 'promosi judi', 'konten judol',
        'login', 'sign in', 'sign up', 'daftar', 'masuk'
    ]

    // Cek apakah teks mengandung kata kunci judol
    // Kata di whitelist tidak akan men-trigger deteksi keyword
    function containsJudolKeyword(text) {
        if (!text) return false
        const lower = text.toLowerCase()

        // Helper to check if a match for 'bet' is a false positive
        const isBetFalsePositive = (str, idx) => {
            let start = idx
            while (start > 0 && /[a-z0-9]/i.test(str[start - 1])) {
                start--
            }
            let end = idx + 3 // 'bet'.length
            while (end < str.length && /[a-z0-9]/i.test(str[end])) {
                end++
            }
            const fullWord = str.substring(start, end)
            const falsePositives = ['beta', 'between', 'better', 'alphabet', 'obesity', 'diabetes', 'beetroot', 'beetle', 'beta-']
            return falsePositives.some(fp => fp === fullWord || fullWord.startsWith('beta'))
        }

        return JUDOL_KEYWORDS.some(kw => {
            let idx = lower.indexOf(kw)
            while (idx !== -1) {
                if (kw === 'bet') {
                    if (!isBetFalsePositive(lower, idx)) {
                        return true
                    }
                } else {
                    return true
                }
                idx = lower.indexOf(kw, idx + 1)
            }
            return false
        })
    }

    // Cek khusus untuk alt text dan src gambar — pakai keyword tunggal yang lebih agresif
    function containsJudolImageKeyword(text) {
        if (!text) return false
        const lower = text.toLowerCase()

        // Helper to check if a match for 'bet' is a false positive
        const isBetFalsePositive = (str, idx) => {
            let start = idx
            while (start > 0 && /[a-z0-9]/i.test(str[start - 1])) {
                start--
            }
            let end = idx + 3 // 'bet'.length
            while (end < str.length && /[a-z0-9]/i.test(str[end])) {
                end++
            }
            const fullWord = str.substring(start, end)
            const falsePositives = ['beta', 'between', 'better', 'alphabet', 'obesity', 'diabetes', 'beetroot', 'beetle', 'beta-']
            return falsePositives.some(fp => fp === fullWord || fullWord.startsWith('beta'))
        }

        return JUDOL_IMAGE_KEYWORDS.some(kw => {
            let idx = lower.indexOf(kw)
            while (idx !== -1) {
                if (kw === 'bet') {
                    if (!isBetFalsePositive(lower, idx)) {
                        return true
                    }
                } else {
                    return true
                }
                idx = lower.indexOf(kw, idx + 1)
            }
            return false
        })
    }

    // Cek apakah sebuah URL/href mengandung kata judol (slug atau domain)
    function hrefIsJudol(href) {
        if (!href) return false
        const lower = href.toLowerCase()
        // Abaikan anchor internal, mailto, javascript:
        if (lower.startsWith('#') || lower.startsWith('mailto:') || lower.startsWith('javascript:')) return false

        // Helper to check if a match for 'bet' is a false positive
        const isBetFalsePositive = (str, idx) => {
            let start = idx
            while (start > 0 && /[a-z0-9]/i.test(str[start - 1])) {
                start--
            }
            let end = idx + 3 // 'bet'.length
            while (end < str.length && /[a-z0-9]/i.test(str[end])) {
                end++
            }
            const fullWord = str.substring(start, end)
            const falsePositives = ['beta', 'between', 'better', 'alphabet', 'obesity', 'diabetes', 'beetroot', 'beetle', 'beta-']
            return falsePositives.some(fp => fp === fullWord || fullWord.startsWith('beta'))
        }

        return JUDOL_HREF_KEYWORDS.some(kw => {
            let idx = lower.indexOf(kw)
            while (idx !== -1) {
                if (kw === 'bet') {
                    if (!isBetFalsePositive(lower, idx)) {
                        return true
                    }
                } else {
                    return true
                }
                idx = lower.indexOf(kw, idx + 1)
            }
            return false
        })
    }

    // ── EKSTRAKSI GAMBAR (mendukung lazy-load & CSS sizing) ──
    function extractImages() {
        // Include amp-img for AMP pages (Accelerated Mobile Pages)
        const imgs = [...document.querySelectorAll('img, amp-img, [data-src], [data-lazy], [data-lazy-src], [data-original]')]

        // Tidak lagi pakai seen per-URL — izinkan URL sama dari elemen berbeda
        // agar gambar yang muncul di beberapa tempat semuanya ter-blur
        const seenEls = new Set()
        const result = []
        const seenSrc = new Set()  // tetap tracking URL untuk keperluan pengiriman ke API (dedup)

        for (const img of imgs) {
            // Ambil URL gambar — coba src asli, lalu atribut lazy-load
            let src = img.src ||
                img.dataset.src ||
                img.dataset.lazy ||
                img.dataset.lazySrc ||
                img.dataset.original || ''

            // Konversi relative URL ke absolute URL
            if (src && !src.startsWith('http')) {
                try {
                    src = new URL(src, window.location.href).href
                } catch {
                    continue // skip URL tidak valid
                }
            }

            if (!src.startsWith('http')) continue
            if (seenEls.has(img)) continue   // skip elemen yang sama persis
            if (src.includes('favicon')) continue

            // Cek alt text dan URL src terhadap keyword judol (gambar)
            const altText = (img.alt || '').toLowerCase()
            const isObviouslyJudol = containsJudolImageKeyword(altText) || containsJudolImageKeyword(src)

            // Deteksi logo website (berdasarkan src, alt, class, id)
            const isLogo = !isObviouslyJudol && (
                src.includes('logo') ||
                altText.includes('logo') ||
                (img.className || '').toLowerCase().includes('logo') ||
                (img.id || '').toLowerCase().includes('logo') ||
                src.includes('brand') ||
                (img.className || '').toLowerCase().includes('brand')
            )

            // Filter avatar (kecuali judol atau logo)
            if (!isObviouslyJudol && !isLogo) {
                if (src.includes('avatar')) continue
            }

            // Dimensi: coba naturalWidth → width attr → getAttribute → getBoundingClientRect
            let w = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0
            let h = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0
            if ((!w || !h) && img.getBoundingClientRect) {
                const rect = img.getBoundingClientRect()
                w = w || Math.round(rect.width)
                h = h || Math.round(rect.height)
            }

            // Semua gambar diproses tanpa filter ukuran

            seenEls.add(img)
            result.push({
                src: src,
                alt: img.alt || '',
                w: w,
                h: h,
                altIsJudol: isObviouslyJudol,
                isLogo: isLogo,
                el: img,
                // flag apakah URL ini sudah ada di list (untuk dedup saat kirim ke API)
                srcDuplicate: seenSrc.has(src)
            })
            seenSrc.add(src)
        }

        return result
    }

    // ── HELPER: cek apakah extension context masih valid ──
    function isExtensionAlive() {
        try {
            // chrome.runtime.id throws jika context sudah invalidated
            return !!chrome.runtime?.id
        } catch (e) {
            return false
        }
    }

    // ── WRAPPER: sendMessage yang aman — tidak throw jika context mati ──
    function safeSendMessage(msg, callback) {
        if (!isExtensionAlive()) {
            if (callback) callback(null)
            return
        }
        try {
            chrome.runtime.sendMessage(msg, (response) => {
                if (chrome.runtime.lastError) {
                    // Abaikan error "context invalidated" dan "receiving end does not exist"
                    if (callback) callback(null)
                    return
                }
                if (callback) callback(response)
            })
        } catch (e) {
            if (callback) callback(null)
        }
    }

    // ── KONVERSI GAMBAR KE BASE64 (Melalui background script untuk bypass CORS) ──
    async function imageUrlToBase64(url) {
        return new Promise((resolve) => {
            safeSendMessage({ type: 'CONVERT_TO_BASE64', url: url }, (response) => {
                resolve(response && response.base64 ? response.base64 : null)
            })
        })
    }

    // ── PREDIKSI TEKS AI (IndoBERT) ──
    // Cache untuk hasil prediksi teks agar tidak panggil API berulang
    const textPredictionCache = new Map()

    async function predictTextAI(text) {
        if (!text || text.trim().length < 2) return false

        // Cek cache dulu
        const cacheKey = text.toLowerCase().trim()
        if (textPredictionCache.has(cacheKey)) {
            return textPredictionCache.get(cacheKey)
        }

        // Panggil API via background script
        return new Promise(resolve => {
            safeSendMessage({ type: 'PREDICT_TEXT', text: text }, (response) => {
                if (response && response.api_down) {
                    // API down, fallback ke false (tidak blur)
                    console.warn('[Judol Detector] API down untuk prediksi teks, fallback ke keyword-only')
                    resolve(false)
                    return
                }

                const isJudol = response && response.is_judol
                // Simpan ke cache
                textPredictionCache.set(cacheKey, isJudol)

                // Batasi ukuran cache (max 500 entries) agar tidak membebani memori
                if (textPredictionCache.size > 500) {
                    const firstKey = textPredictionCache.keys().next().value
                    textPredictionCache.delete(firstKey)
                }

                resolve(isJudol)
            })
        })
    }

    // ── WHITELIST DOMAIN — halaman ini tidak perlu di-scan ──
    // Tambahkan domain yang kamu percaya (termasuk landing page sendiri)
    const TRUSTED_DOMAINS = [
        // Landing page Judol Detector sendiri
        // Tambahkan domain hosting landing page kamu di sini, misal:
        // 'judol-detector.vercel.app',
        // 'judoldetector.id',
    ]

    function isTrustedDomain() {
        const hostname = window.location.hostname.toLowerCase()
        return TRUSTED_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        )
    }

    // ── DETEKSI: apakah halaman ini tentang Judol Detector (tools-nya), bukan promosi judol ──
    // Cek apakah halaman punya meta tag khusus yang menandai sebagai tool anti-judol
    function isAntiJudolToolPage() {
        // Cek meta generator atau meta khusus yang bisa ditambahkan ke halaman trusted
        const metaApp = document.querySelector('meta[name="application-name"]')?.content || ''
        const metaKeywords = document.querySelector('meta[name="keywords"]')?.content?.toLowerCase() || ''
        const titleLower = (document.title || '').toLowerCase()

        // Halaman yang judulnya mengandung "detector" atau "detektor" + "judol/judi"
        // kemungkinan besar adalah tools, bukan situs promosi
        const isDetectorPage = (
            (titleLower.includes('detector') || titleLower.includes('detektor')) &&
            (titleLower.includes('judol') || titleLower.includes('judi'))
        )

        return isDetectorPage || metaApp.toLowerCase().includes('judol detector')
    }

    // ── CEK APAKAH HALAMAN INI ADALAH SEARCH ENGINE RESULTS PAGE (SERP) ──
    function isSearchEnginePage() {
        const hostname = window.location.hostname.toLowerCase()
        const params = new URLSearchParams(window.location.search)

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

        // Jangan scan domain yang di-whitelist (misal: landing page sendiri)
        if (isTrustedDomain()) {
            console.log('[Judol Detector] Domain trusted, scan dilewati.')
            return
        }

        // Jangan scan halaman yang merupakan tools anti-judol (false positive by design)
        if (isAntiJudolToolPage()) {
            console.log('[Judol Detector] Halaman terdeteksi sebagai tools anti-judol, scan dilewati.')
            return
        }

        // Tampilkan loading indicator
        showLoadingIndicator()

        const text = extractText()
        const images = extractImages()

        // Deteksi awal halaman: hanya kirim 5 gambar terbesar ke API
        // (tidak perlu semua gambar, cukup untuk menentukan apakah halaman judol)
        const MAX_IMAGES = 5
        const selectedImages = images
            .filter(img => !img.srcDuplicate)
            .sort((a, b) => (b.w * b.h) - (a.w * a.h))
            .slice(0, MAX_IMAGES)

        // Konversi ke base64 secara paralel
        const base64Promises = selectedImages.map(img => imageUrlToBase64(img.src))
        const base64Results = await Promise.all(base64Promises)
        const validBase64s = base64Results.filter(b64 => b64 !== null)

        safeSendMessage({
            type: 'PAGE_DATA',
            url: window.location.href,
            text: text,
            mainImage: validBase64s[0] || null,
            images: validBase64s,
            allImages: images.map(img => img.src)
        }, () => { })  // callback kosong — tidak perlu response
    }

    // ── STATE ──
    let isPageJudol = false;
    let hasShownWarning = false;  // flag: peringatan sudah pernah ditampilkan di halaman ini
    let isFromCache = false;      // flag: hasil deteksi berasal dari cache
    let wasCachedAtStartup = false; // flag: cache sudah ditemukan saat halaman dimuat

    // ── CACHE HELPERS ──
    function getCurrentHostname() {
        return window.location.hostname.toLowerCase()
    }

    // Menggunakan hostname + pathname sebagai cache key agar setiap halaman
    // di domain yang sama memiliki cache terpisah.
    // Contoh: detik.com/berita/a dan detik.com/berita/b → cache berbeda.
    function getCurrentPageKey() {
        const loc = window.location
        const pathname = loc.pathname.replace(/\/+$/, '') || '/'  // hilangkan trailing slash
        return (loc.hostname + pathname).toLowerCase()
    }

    // Ambil cache deteksi dari background (berdasarkan pageKey = hostname+pathname)
    function getCacheFromBackground(pageKey) {
        return new Promise(resolve => {
            safeSendMessage({ type: 'GET_CACHE', pageKey }, (cached) => {
                resolve(cached || null)
            })
        })
    }

    // Simpan info elemen yang di-blur ke cache (berdasarkan pageKey = hostname+pathname)
    function saveBlurCacheToBackground(pageKey, blurredImages, blurredTextSelectors) {
        safeSendMessage({
            type: 'SAVE_BLUR_CACHE',
            pageKey,
            blurredImages,
            blurredTextSelectors
        }, () => { })
    }

    // Blur elemen berdasarkan data cache (tanpa scan ulang)
    function applyBlurFromCache(cached) {
        if (!cached || !cached.is_judol) return

        chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
            if (!data.isActive || !data.sensorActive) return

            let blurredCount = 0

            // 1. Blur gambar berdasarkan src yang tersimpan di cache
            if (cached.blurredImages && cached.blurredImages.length > 0) {
                const allImgs = document.querySelectorAll('img')
                allImgs.forEach(img => {
                    const imgSrc = img.src || img.dataset?.src || img.dataset?.lazy || img.dataset?.lazySrc || img.dataset?.original || ''
                    if (cached.blurredImages.includes(imgSrc)) {
                        blurElement(img)
                        blurredCount++
                    }
                })
            }

            // 2. Blur elemen teks berdasarkan selector/CSS class yang tersimpan di cache
            if (cached.blurredTextSelectors && cached.blurredTextSelectors.length > 0) {
                cached.blurredTextSelectors.forEach(selector => {
                    try {
                        const els = document.querySelectorAll(selector)
                        els.forEach(el => {
                            if (document.getElementById('judol-warning-banner')?.contains(el)) return
                            if (el.dataset.judolTextBlurred === "true") return
                            el.dataset.judolTextBlurred = "true"
                            el.style.filter = 'blur(4px)'
                            el.title = 'Konten disensor oleh Judol Detector'
                            blurredCount++
                        })
                    } catch (e) {
                        // selector invalid, skip
                    }
                })
            }

            // 3. Tetap jalankan blurJudolText() untuk teks keyword-based (cepat, tidak perlu API)
            blurJudolText()

            if (blurredCount > 0) {
                console.log(`[Judol Detector] Cache: ${blurredCount} elemen di-blur dari cache.`)
            }

            // Start observer untuk gambar dinamis
            startImageObserver()
        })
    }

    // ── TERIMA PESAN DARI BACKGROUND/POPUP ──
    chrome.runtime.onMessage.addListener((message) => {
        // Abaikan semua pesan jika ekstensi tidak aktif (kecuali TOGGLE_EXTENSION itu sendiri)
        if (message.type !== 'TOGGLE_EXTENSION' && !isExtensionAlive()) return;

        if (message.type === 'PAGE_RESULT') {
            // Sembunyikan loading indicator saat hasil diterima
            hideLoadingIndicator()

            isPageJudol = message.result.is_judol;
            isFromCache = message.fromCache || false;

            if (isPageJudol) {
                // JANGAN tampilkan warning overlay jika hasil dari cache ATAU sudah pernah dideteksi dari cache di startup
                if (!isFromCache && !wasCachedAtStartup && !hasShownWarning) {
                    hasShownWarning = true;
                    showFloatingWarning(message.result)
                } else if (isFromCache || wasCachedAtStartup) {
                    hasShownWarning = true;
                    console.log('[Judol Detector] Hasil dari cache, warning overlay dilewati.')
                }
                chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
                    if (data.isActive && data.sensorActive && isPageJudol) {
                        scanAndBlurImages();
                    }
                });
            }
        }

        if (message.type === 'HIDE_LOADING') {
            hideLoadingIndicator()
        }

        if (message.type === 'API_DOWN') {
            showServerDownIndicator()
        }

        if (message.type === 'SHOW_WARNING') { // Fallback if still sent
            isPageJudol = true;
            if (!hasShownWarning) {
                hasShownWarning = true;
                showFloatingWarning(message.result)
            }
        }

        if (message.type === 'START_SENSOR_SCAN') {
            if (isPageJudol) {
                chrome.storage.local.get(['isActive'], (data) => {
                    if (data.isActive && isPageJudol) scanAndBlurImages()
                })
            }
        }

        if (message.type === 'TOGGLE_SENSOR') {
            if (!message.active) {
                removeAllBlur()
            } else {
                if (isPageJudol) {
                    // Jika dari cache, coba blur dari cache dulu (lebih cepat)
                    if (isFromCache || wasCachedAtStartup) {
                        const pageKey = getCurrentPageKey()
                        getCacheFromBackground(pageKey).then(cached => {
                            if (cached && cached.blurredImages && cached.blurredImages.length > 0) {
                                applyBlurFromCache(cached)
                            }
                            // Tetap scan untuk elemen baru yang tidak ada di cache
                            scanAndBlurImages()
                        })
                    } else {
                        scanAndBlurImages()
                    }
                }
            }
        }

        if (message.type === 'TOGGLE_EXTENSION') {
            if (!message.active) {
                // Hentikan observer agar tidak ada blur ulang
                stopImageObserver()

                // Hapus banner warning jika ada
                const warningBanner = document.getElementById('judol-warning-banner');
                if (warningBanner) warningBanner.remove();

                // Reset semua state
                removeAllBlur();
                isPageJudol = false;
                hasShownWarning = false;
                isFromCache = false;
                wasCachedAtStartup = false;
            } else {
                // Jalankan ulang deteksi halaman — cek cache dulu, jangan scan ulang jika ada
                hasShownWarning = false;
                isFromCache = false;
                wasCachedAtStartup = false;

                const pageKey = getCurrentPageKey()
                getCacheFromBackground(pageKey).then(cached => {
                    if (cached) {
                        // Ada cache — gunakan cache, jangan scan ulang
                        if (cached.is_judol) {
                            isPageJudol = true
                            isFromCache = true
                            wasCachedAtStartup = true
                            hasShownWarning = true
                            applyBlurFromCache(cached)
                        } else {
                            wasCachedAtStartup = true
                        }
                        safeSendMessage({
                            type: 'PAGE_RESULT_FROM_CACHE',
                            result: cached.result,
                            fromCache: true
                        }, () => { })
                    } else {
                        // Tidak ada cache — scan baru
                        collectAndSend()
                    }
                })
            }
        }
    })

    // ── TAMPILKAN WARNING FLOATING DI HALAMAN ──
    function showFloatingWarning(result) {
        // Jika sudah ada banner, jangan buat lagi (mencegah race condition)
        const existing = document.getElementById('judol-warning-banner');
        if (existing) return;

        const pct = (v) => Math.round(v * 100);
        const pctFinal = pct(result.final_confidence);
        const pctImage = pct(result.confidence_image);
        const pctText = pct(result.confidence_text);
        const pctFusion = pct(result.confidence_fusion);

        // ── helper: buat baris skor ──────────────────────────────────
        function scoreRow(label, value, barColor, textColor, height) {
            return `
        <div style="display:flex !important; flex-direction:column !important; gap:5px !important;">
            <div style="display:flex !important; justify-content:space-between !important; align-items:center !important;">
                <span style="font-size:12px !important; font-weight:500 !important; color:#444 !important; font-family:inherit !important;">${label}</span>
                <span style="font-size:12px !important; font-weight:700 !important; color:${textColor} !important; font-family:inherit !important;">${value}%</span>
            </div>
            <div style="height:${height}px !important; background:#ebebeb !important; border-radius:3px !important; overflow:hidden !important;">
                <div style="height:100% !important; width:${value}% !important; background:${barColor} !important; border-radius:3px !important;"></div>
            </div>
        </div>`;
        }

        // URL logo dan font harus dihitung sebelum masuk ke innerHTML
        const logoUrl = chrome.runtime.getURL('icons/jd_trans.png');
        const fontUrl = chrome.runtime.getURL('fonts/Nohemi-VF.ttf');

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
        font-family: 'Nohemi', -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif !important;
        box-sizing: border-box !important;
        padding: 20px !important;
        opacity: 0 !important;
        transition: opacity 0.2s ease !important;
    `;

        overlay.innerHTML = `
        <style>
            @font-face {
                font-family: 'Nohemi';
                src: url('${fontUrl}') format('truetype');
                font-weight: 100 900;
                font-style: normal;
                font-display: swap;
            }
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
                ${scoreRow('Analisis Gambar', pctImage, '#070707', '#555555', 4)}
                ${scoreRow('Analisis Teks', pctText, '#070707', '#555555', 4)}
                ${scoreRow('Analisis Fusion', pctFusion, '#070707', '#555555', 4)}
                <div style="height:1px !important; background:#e4e4e4 !important; margin:2px 0 !important;"></div>
                ${scoreRow('Skor Akhir', pctFinal, '#c92a2a', '#c92a2a', 5)}
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
            safeSendMessage({ type: 'BLOCK_SITE', url: hostname }, () => { })
            window.location.replace(
                chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(hostname)}`)
            );
        });

        overlay.querySelector('#jd-btn-report').addEventListener('click', () => {
            // Copy URL halaman ke clipboard
            navigator.clipboard.writeText(window.location.href).catch(() => { })
            window.open('https://aduankonten.id/?from=judol', '_blank');
        });

        document.body.prepend(overlay);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { overlay.style.opacity = '1'; });
        });
    }

    // ── SCAN SEMUA GAMBAR & BLUR YANG TERDETEKSI JUDOL ──
    async function scanAndBlurImages() {
        if (!isPageJudol) return;
        if (!isExtensionAlive()) return;

        const storage = await new Promise(resolve => {
            chrome.storage.local.get(['isActive', 'sensorActive'], resolve);
        });
        if (!storage.isActive || !storage.sensorActive) {
            return;
        }

        const images = extractImages()
        const blurredImageSrcs = []  // track gambar yang di-blur untuk disimpan ke cache

        // Load cached image predictions to avoid re-checking same images
        const imageCacheKey = 'judol_image_cache'
        let imageCache = await new Promise(resolve => {
            chrome.storage.local.get([imageCacheKey], result => {
                resolve(result[imageCacheKey] || {})
            })
        })

        const DELAY_BETWEEN_REQUESTS = 150  // ms between API calls

        let checked = 0
        for (const imgData of images) {

            // Gunakan referensi elemen langsung yang disimpan saat ekstraksi
            let imgEl = (imgData.el && imgData.el.isConnected) ? imgData.el : null

            if (!imgEl) {
                imgEl = [...document.querySelectorAll('img')].find(el => {
                    const elSrc = el.src || el.dataset.src || el.dataset.lazy || ''
                    return elSrc === imgData.src
                }) || null
            }

            if (!imgEl) continue

            try {
                // JALUR CEPAT: alt text atau URL sudah mengandung kata judol → langsung blur
                if (imgData.altIsJudol) {
                    blurElement(imgEl)
                    blurredImageSrcs.push(imgData.src)
                    continue
                }

                // Check cache first
                if (imageCache[imgData.src] !== undefined) {
                    if (imageCache[imgData.src]) {
                        blurElement(imgEl)
                        blurredImageSrcs.push(imgData.src)
                    }
                    continue
                }

                // JALUR MODEL: fetch gambar via background (bypass CORS) lalu kirim ke API
                const base64 = await imageUrlToBase64(imgData.src)
                if (!base64) continue

                checked++
                const result = await new Promise(resolve => {
                    safeSendMessage({ type: 'PREDICT_IMAGE', base64: base64 }, response => {
                        resolve(response || null)
                    })
                })

                // Jika API down, skip gambar ini tanpa cache
                if (!result || result.api_down) {
                    console.warn('[Judol Detector] API tidak merespons, skip prediksi gambar.')
                    continue
                }

                // Cache the result
                imageCache[imgData.src] = result.is_judol

                if (result.is_judol) {
                    blurElement(imgEl)
                    blurredImageSrcs.push(imgData.src)
                }

                // Small delay to avoid overwhelming server
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS))
            } catch (e) {
                // skip gambar yang tidak bisa diproses
            }
        }

        // Save updated cache
        chrome.storage.local.set({ [imageCacheKey]: imageCache })

        // Blur teks yang mengandung kata kunci judol
        await blurJudolText()

        // Scan background-image elements via AI untuk yang tidak tertangkap keyword
        await scanAndBlurBackgroundImages(imageCache, blurredImageSrcs)

        // Kumpulkan selector elemen teks yang di-blur untuk cache
        const blurredTextSelectors = []
        document.querySelectorAll('[data-judol-text-blurred="true"]').forEach(el => {
            if (el.id) {
                blurredTextSelectors.push('#' + CSS.escape(el.id))
            } else if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('judol')).slice(0, 3)
                if (classes.length > 0) {
                    const sel = el.tagName.toLowerCase() + classes.map(c => '.' + CSS.escape(c)).join('')
                    blurredTextSelectors.push(sel)
                }
            }
        })

        // Simpan data blur ke cache (per halaman, bukan per domain)
        if (blurredImageSrcs.length > 0 || blurredTextSelectors.length > 0) {
            saveBlurCacheToBackground(
                getCurrentPageKey(),
                blurredImageSrcs,
                blurredTextSelectors
            )
        }
    }

    // ── SCAN BACKGROUND-IMAGE ELEMENTS VIA AI ──
    // Mendeteksi elemen dengan background-image yang URL-nya tidak mengandung keyword judol
    // tapi gambarnya mungkin berisi konten judol (misalnya banner jackpot tanpa kata 'jackpot' di URL)
    async function scanAndBlurBackgroundImages(imageCache, blurredImageSrcs) {
        if (!isPageJudol) return
        if (!isExtensionAlive()) return

        const storage = await new Promise(resolve => {
            chrome.storage.local.get(['isActive', 'sensorActive'], resolve)
        })
        if (!storage.isActive || !storage.sensorActive) return

        const DELAY = 150
        const bgEls = document.querySelectorAll('[style*="background-image"]')

        for (const el of bgEls) {
            if (document.getElementById('judol-warning-banner')?.contains(el)) continue
            if (el.dataset.judolTextBlurred === 'true') continue
            if (el.dataset.judolBgChecked === 'true') continue

            const style = el.getAttribute('style') || ''
            let bgUrl = style.match(/url\((['"]?)([^)'"]+)\1\)/)?.[2] || ''
            if (!bgUrl) continue

            // Normalisasi protocol-relative URL (//cdn.example.com/...) ke https
            if (bgUrl.startsWith('//')) {
                bgUrl = 'https:' + bgUrl
            }

            // Hanya proses URL absolut
            if (!bgUrl.startsWith('http')) continue

            // Skip jika URL sudah mengandung keyword (sudah ditangani di blurJudolText)
            if (containsJudolImageKeyword(bgUrl)) continue

            // Tandai sudah dicek agar tidak diproses ulang
            el.dataset.judolBgChecked = 'true'

            try {
                // Cek cache dulu
                if (imageCache[bgUrl] !== undefined) {
                    if (imageCache[bgUrl]) {
                        el.dataset.judolTextBlurred = 'true'
                        el.style.filter = 'blur(8px)'
                        el.style.pointerEvents = 'none'
                        el.title = 'Konten disensor oleh Judol Detector'
                        blurredImageSrcs.push(bgUrl)
                    }
                    continue
                }

                // Fetch gambar dan kirim ke model AI
                const base64 = await imageUrlToBase64(bgUrl)
                if (!base64) continue

                const result = await new Promise(resolve => {
                    safeSendMessage({ type: 'PREDICT_IMAGE', base64: base64 }, response => {
                        resolve(response || null)
                    })
                })

                if (!result || result.api_down) continue

                // Cache hasil
                imageCache[bgUrl] = result.is_judol

                if (result.is_judol) {
                    el.dataset.judolTextBlurred = 'true'
                    el.style.filter = 'blur(8px)'
                    el.style.pointerEvents = 'none'
                    el.title = 'Konten disensor oleh Judol Detector'
                    blurredImageSrcs.push(bgUrl)
                    console.log('[Judol Detector] Background image judol terdeteksi via AI: ' + bgUrl)
                }

                await new Promise(r => setTimeout(r, DELAY))
            } catch (e) {
                // skip elemen yang tidak bisa diproses
            }
        }

        // Simpan cache yang diperbarui
        chrome.storage.local.set({ judol_image_cache: imageCache })
    }

    // ── BLUR GAMBAR ──
    function blurElement(el) {
        // Jangan sensor elemen yang ada di dalam overlay warning kita sendiri
        if (document.getElementById('judol-warning-banner')?.contains(el)) return

        if (el.dataset.judolBlurred === "true") return;
        el.dataset.judolBlurred = "true";

        // Simpan inline styles asli untuk mempermudah restore
        el.dataset.originalPointerEvents = el.style.pointerEvents || '';
        el.style.pointerEvents = 'none';

        // Bungkus elemen dengan wrapper sensor khusus untuk overlay hitam
        // Wrapper diposisikan persis sesuai dengan ukuran dan posisi asli elemen agar tidak merusak layout
        const wrapper = document.createElement('div')
        wrapper.dataset.judolWrapper = "true";
        wrapper.style.cssText = `
        position: relative !important;
        display: inline-block !important;
        width: ${el.offsetWidth ? el.offsetWidth + 'px' : 'auto'} !important;
        height: ${el.offsetHeight ? el.offsetHeight + 'px' : 'auto'} !important;
        pointer-events: none !important;
        user-select: none !important;
    `

        // Buat overlay hitam solid di atas gambar
        const overlay = document.createElement('div')
        overlay.dataset.judolImageOverlay = "true";
        overlay.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: #000000 !important;
        z-index: 9999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        pointer-events: auto !important; /* block clicks on image */
        cursor: not-allowed !important;
    `

        const label = document.createElement('div')
        label.textContent = '🚫'
        label.style.cssText = `
        color: #ff3b30 !important;
        background: transparent !important;
        border: none !important;
        font-size: 28px !important;
        pointer-events: none !important;
        white-space: nowrap !important;
    `
        overlay.appendChild(label)

        // Masukkan wrapper sebelum el, lalu masukkan el & overlay ke dalam wrapper
        if (el.parentNode) {
            el.parentNode.insertBefore(wrapper, el)
            wrapper.appendChild(el)
            wrapper.appendChild(overlay)
        }
    }

    // ── BLUR TEKS JUDOL (kata kunci + AI) ──
    async function blurJudolText() {
        const keywords = JUDOL_KEYWORDS
        const aiQueue = []

        function queueForAI(el, text, applyBlurFn) {
            if (!text || text.length < 3 || text.length > 150) return
            if (el.dataset.judolTextBlurred === 'true') return
            if (el.dataset.judolAiChecked === 'true') return
            if (aiQueue.some(item => item.el === el)) return
            aiQueue.push({ el, text, applyBlurFn })
        }

        // 1. Blur via TreeWalker pada text nodes (perilaku lama, tetap dipertahankan)
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
        )

        const nodes = []
        while (walker.nextNode()) nodes.push(walker.currentNode)

        nodes.forEach(node => {
            // Jangan blur teks yang ada di dalam overlay warning kita sendiri
            if (node.parentElement && document.getElementById('judol-warning-banner')?.contains(node.parentElement)) return

            const text = node.textContent.toLowerCase().trim()

            // Skip jika teks hanya berisi kata whitelist (misal: nama aplikasi "Judol Detector")
            const isWhitelisted = JUDOL_WHITELIST_EXACT.some(w => {
                return text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w)
            })
            if (isWhitelisted) return

            const found = keywords.some(kw => text.includes(kw))

            if (found && node.parentElement) {
                if (node.parentElement.dataset.judolTextBlurred === "true") return;
                const parentTag = node.parentElement.tagName.toLowerCase()
                const BIG_CONTAINERS = ['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'body', 'html', 'form', 'ul', 'ol', 'table', 'tbody', 'tr']
                if (BIG_CONTAINERS.includes(parentTag) && node.parentElement.children.length > 1) return
                node.parentElement.dataset.judolTextBlurred = "true";
                node.parentElement.style.filter = 'blur(4px)'
                node.parentElement.style.pointerEvents = 'none'
                node.parentElement.title = 'Konten disensor oleh Judol Detector'
            } else if (!found && node.parentElement && text.length <= 120) {
                const tag = node.parentElement.tagName.toLowerCase()
                const LEAF_TAGS = ['span', 'a', 'b', 'strong', 'em', 'li', 'td', 'th', 'button', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
                if (LEAF_TAGS.includes(tag)) {
                    const el = node.parentElement
                    queueForAI(el, text, () => {
                        el.dataset.judolTextBlurred = 'true'
                        el.style.filter = 'blur(4px)'
                        el.style.pointerEvents = 'none'
                        el.title = 'Konten disensor oleh Judol Detector'
                    })
                }
            }
        })

        // 2. Blur elemen <b>, <strong>, <em>, <span> yang teksnya mengandung kata judol
        const inlineEls = document.querySelectorAll('b, strong, em, span')
        inlineEls.forEach(el => {
            if (document.getElementById('judol-warning-banner')?.contains(el)) return
            if (el.dataset.judolTextBlurred === "true") return

            const text = (el.innerText || el.textContent || '').toLowerCase().trim()
            if (!text || text.length < 3) return

            const isWhitelisted = JUDOL_WHITELIST_EXACT.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w))
            if (isWhitelisted) return

            if (keywords.some(kw => text.includes(kw))) {
                el.dataset.judolTextBlurred = "true"
                el.style.filter = 'blur(4px)'
                el.style.pointerEvents = 'none'
                el.title = 'Konten disensor oleh Judol Detector'
            } else {
                queueForAI(el, text, () => {
                    el.dataset.judolTextBlurred = 'true'
                    el.style.filter = 'blur(4px)'
                    el.style.pointerEvents = 'none'
                    el.title = 'Konten disensor oleh Judol Detector'
                })
            }
        })

        // 4. Blur elemen yang background-image URL-nya mengandung kata judol
        //    Contoh: div[style*="url(//...jackpot/animation.gif)"]
        const allEls = document.querySelectorAll('[style*="background-image"]')
        allEls.forEach(el => {
            if (document.getElementById('judol-warning-banner')?.contains(el)) return
            if (el.dataset.judolTextBlurred === "true") return

            const style = el.getAttribute('style') || ''
            const bgUrl = style.match(/url\((['"]?)([^)'"]+)\1\)/)?.[2] || ''
            if (!bgUrl) return

            // Jika URL background jelas mengandung keyword judol, langsung blur
            // (tidak peduli apakah container besar atau tidak)
            if (containsJudolImageKeyword(bgUrl)) {
                el.dataset.judolTextBlurred = "true"
                el.style.filter = 'blur(8px)'
                el.style.pointerEvents = 'none'
                el.title = 'Konten disensor oleh Judol Detector'
            }
            // Jika container besar dengan anak, hanya proses jika URL-nya keyword match (sudah dihandle di atas)
            // Jangan queue AI untuk container besar agar tidak terlalu agresif
        })

        // 5. Blur elemen yang class atau id-nya mengandung kata judol sebagai segmen tersendiri
        const JUDOL_CLASS_KEYWORDS = [
            'jackpot', 'slot-gacor', 'togel', 'casino', 'scatter',
            'maxwin', 'gacor', 'judol', 'judi', 'poker',
            'slot88', 'slot77', 'slot-online', 'progressive-jackpot',
            'rtp-slot', 'bocoran-slot', 'demo-slot'
        ]
        document.querySelectorAll('*').forEach(el => {
            if (document.getElementById('judol-warning-banner')?.contains(el)) return
            if (el.dataset.judolTextBlurred === "true") return
            const tag = el.tagName.toLowerCase()
            if (['html', 'body', 'head', 'script', 'style', 'meta', 'link'].includes(tag)) return

            // Mencegah block container besar ikut di-blur akibat nama class/id
            const BIG_CONTAINERS = ['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'body', 'html', 'form', 'ul', 'ol', 'table', 'tbody', 'tr']
            if (BIG_CONTAINERS.includes(tag)) return

            const classStr = (el.className && typeof el.className === 'string')
                ? el.className.toLowerCase() : ''
            const idStr = (el.id || '').toLowerCase()
            const combined = classStr + ' ' + idStr

            if (JUDOL_CLASS_KEYWORDS.some(kw => combined.includes(kw))) {
                el.dataset.judolTextBlurred = "true"
                el.style.filter = 'blur(8px)'
                el.style.pointerEvents = 'none'
                el.title = 'Konten disensor oleh Judol Detector'
            }
        })


        // 6. Blur anchor elements
        const anchorEls = document.querySelectorAll('a')
        anchorEls.forEach(el => {
            if (document.getElementById('judol-warning-banner')?.contains(el)) return
            if (el.dataset.judolTextBlurred === "true") return

            const text = (el.innerText || el.textContent || '').toLowerCase().trim()
            const href = el.getAttribute('href') || ''

            const textIsJudol = keywords.some(kw => text.includes(kw))
            const hrefJudol = hrefIsJudol(href)

            if (textIsJudol || hrefJudol) {
                el.dataset.judolTextBlurred = "true"
                el.style.filter = 'blur(4px)'
                el.style.pointerEvents = 'none'   // nonaktifkan klik link judol
                el.title = 'Konten disensor oleh Judol Detector'
            } else if (text.length >= 3 && text.length <= 120) {
                queueForAI(el, text, () => {
                    el.dataset.judolTextBlurred = 'true'
                    el.style.filter = 'blur(4px)'
                    el.style.pointerEvents = 'none'
                    el.title = 'Konten disensor oleh Judol Detector'
                })
            }
        })

        // 7. Blur elemen yang aria-label atau title-nya mengandung kata judol
        const attrEls = document.querySelectorAll('[aria-label], [title]')
        attrEls.forEach(el => {
            if (document.getElementById('judol-warning-banner')?.contains(el)) return
            if (el.dataset.judolTextBlurred === "true") return

            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase()
            const titleAttr = (el.getAttribute('title') || '').toLowerCase()
            const combined = ariaLabel + ' ' + titleAttr

            if (keywords.some(kw => combined.includes(kw))) {
                el.dataset.judolTextBlurred = "true"
                el.style.filter = 'blur(4px)'
                el.title = 'Konten disensor oleh Judol Detector'
            }
        })

        // 8. Anti-evasion: cek combined text dari parent elements
        // Situs judol memecah teks ke beberapa <span> per huruf agar tidak terdeteksi
        // Contoh: <div><span>K</span><span>A</span><span>K</span>...</div> → "KAKEK303"
        // Solusi: deteksi, lalu bungkus container dengan overlay blur TEPAT di atasnya
        // sehingga hanya area teks tersebut yang tertutupi, bukan seluruh div halaman.
        const containerEls = document.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, li, td, th, footer, header, section, article, nav')
        const INLINE_TAGS_SET = new Set(['SPAN', 'B', 'EM', 'I', 'STRONG', 'FONT', 'S', 'U', 'MARK', 'SMALL'])
        containerEls.forEach(el => {
            if (document.getElementById('judol-warning-banner')?.contains(el)) return
            if (el.dataset.judolTextBlurred === 'true') return
            if (el.dataset.judolOverlaid === 'true') return

            const childEls = [...el.children]
            if (childEls.length === 0) return
            // Hanya proses jika semua anak adalah inline tag (ciri khas split-text anti-deteksi)
            if (!childEls.every(c => INLINE_TAGS_SET.has(c.tagName))) return

            // Get combined text content
            const combinedText = (el.innerText || el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim()
            if (!combinedText || combinedText.length < 3 || combinedText.length > 120) return

            // Skip whitelisted
            const isWhitelisted = JUDOL_WHITELIST_EXACT.some(w => {
                return combinedText === w || combinedText.startsWith(w + ' ') || combinedText.endsWith(' ' + w)
            })
            if (isWhitelisted) return

            function applyOverlayBlur(targetEl) {
                // Pastikan parent punya position agar overlay bisa diposisikan tepat
                const parentPos = window.getComputedStyle(targetEl).position
                if (parentPos === 'static') {
                    targetEl.style.position = 'relative'
                }

                // Simpan inline styles asli untuk mempermudah restore
                targetEl.dataset.originalPointerEvents = targetEl.style.pointerEvents || '';
                targetEl.style.pointerEvents = 'none';

                // Buat overlay div yang menutupi persis area elemen
                const overlay = document.createElement('div')
                overlay.dataset.judolOverlay = 'true'
                overlay.style.cssText = `
                position: absolute !important;
                inset: 0 !important;
                backdrop-filter: blur(6px) !important;
                -webkit-backdrop-filter: blur(6px) !important;
                background: rgba(0,0,0,0.08) !important;
                border-radius: 4px !important;
                z-index: 9999 !important;
                pointer-events: auto !important; /* block clicks and selection */
                cursor: not-allowed !important;
            `
                targetEl.appendChild(overlay)
                targetEl.dataset.judolOverlaid = 'true'
                targetEl.dataset.judolTextBlurred = 'true'
                targetEl.title = 'Konten disensor oleh Judol Detector'
            }

            if (keywords.some(kw => combinedText.includes(kw))) {
                applyOverlayBlur(el)
            } else {
                queueForAI(el, combinedText, () => applyOverlayBlur(el))
            }
        })

        // ── AI Double-Check: batch, dedup ──
        if (aiQueue.length > 0) {
            const seen = new Set()
            const unique = []
            for (const item of aiQueue) {
                const key = item.text.toLowerCase().trim()
                if (!seen.has(key)) {
                    seen.add(key)
                    unique.push(item)
                }
            }
            console.log('[Judol Detector] AI text double-check: ' + unique.length + ' kandidat unik dari ' + aiQueue.length)
            for (const { el, text, applyBlurFn } of unique) {
                if (el.dataset.judolTextBlurred === 'true') continue
                el.dataset.judolAiChecked = 'true'
                const isJudol = await predictTextAI(text)
                if (isJudol) {
                    applyBlurFn()
                    console.log('[Judol Detector] AI blur teks: "' + text + '"')
                }
            }
        }
    }

    // ── HAPUS SEMUA BLUR ──
    function removeAllBlur() {
        // 1. Kembalikan gambar yang di-blur dan di-wrap
        const blurredImages = document.querySelectorAll('[data-judol-blurred="true"]');
        blurredImages.forEach(el => {
            el.style.filter = '';
            el.style.transition = '';
            if (el.dataset.originalPointerEvents !== undefined) {
                el.style.pointerEvents = el.dataset.originalPointerEvents;
                delete el.dataset.originalPointerEvents;
            } else {
                el.style.pointerEvents = '';
            }
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
            el.style.pointerEvents = '';  // kembalikan klik link
            if (el.title === 'Konten disensor oleh Judol Detector') {
                el.removeAttribute('title');
            }
            delete el.dataset.judolTextBlurred;
        });

        // 3. Hapus overlay blur yang dibuat untuk anti-evasion split-text (section 8)
        const overlaidEls = document.querySelectorAll('[data-judol-overlaid="true"]');
        overlaidEls.forEach(el => {
            // Hapus semua overlay div anak
            el.querySelectorAll('[data-judol-overlay="true"]').forEach(o => o.remove());
            // Kembalikan position jika kita yang mengubahnya (hanya jika tidak ada position asli)
            el.style.position = '';
            if (el.dataset.originalPointerEvents !== undefined) {
                el.style.pointerEvents = el.dataset.originalPointerEvents;
                delete el.dataset.originalPointerEvents;
            } else {
                el.style.pointerEvents = '';
            }
            el.removeAttribute('title');
            delete el.dataset.judolOverlaid;
            delete el.dataset.judolTextBlurred;
        });
    }

    // ── OBSERVER: Tangkap gambar yang dimuat secara dinamis (lazy load / infinite scroll) ──
    let _observerActive = false
    let _observer = null
    function startImageObserver() {
        if (_observerActive) return
        _observerActive = true

        _observer = new MutationObserver(() => {
            if (!isPageJudol) return;
            if (!isExtensionAlive()) return;
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

        _observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'data-src', 'data-lazy', 'data-lazy-src', 'data-original']
        })

        console.log('[Judol Detector] MutationObserver aktif — memantau gambar dinamis.')
    }

    function stopImageObserver() {
        if (_observer) {
            _observer.disconnect()
            _observer = null
        }
        _observerActive = false
        clearTimeout(window._judolObserverTimer)
    }

    // Jalankan pengumpulan data saat halaman selesai load
    // HANYA untuk tab yang sedang aktif/visible (menghindari antrian dari background tabs)
    if (isExtensionAlive()) {
        chrome.storage.local.get(['isActive'], async (data) => {
            if (data.isActive !== false) {
                const pageKey = getCurrentPageKey()
                const cached = await getCacheFromBackground(pageKey)

                if (cached && cached.is_judol) {
                    // ── JALUR CEPAT: sudah pernah dideteksi judol sebelumnya ──
                    console.log('[Judol Detector] Cache: Halaman terdeteksi judol, langsung blur tanpa scan ulang.')
                    isPageJudol = true
                    isFromCache = true
                    wasCachedAtStartup = true
                    hasShownWarning = true // skip warning overlay

                    // Simpan hasil ke session storage agar popup bisa menampilkan hasil
                    // tanpa perlu trigger API call ulang
                    safeSendMessage({
                        type: 'PAGE_RESULT_FROM_CACHE',
                        result: cached.result,
                        fromCache: true
                    }, () => { })

                    // Langsung blur dari cache jika sensor aktif
                    applyBlurFromCache(cached)

                } else if (cached && !cached.is_judol) {
                    // ── JALUR CEPAT: sudah pernah dideteksi AMAN sebelumnya ──
                    console.log('[Judol Detector] Cache: Halaman terdeteksi aman, scan dilewati.')
                    wasCachedAtStartup = true
                    // Tidak perlu scan ulang — popup akan baca dari session storage via GET_RESULT

                } else {
                    // ── BELUM ADA CACHE: hanya detect jika tab VISIBLE ──
                    // Background tabs tidak akan trigger API call (menghindari queue)
                    if (document.visibilityState === 'visible') {
                        console.log('[Judol Detector] Tab visible, memulai deteksi...')
                        collectAndSend()
                    } else {
                        console.log('[Judol Detector] Tab tidak visible, menunggu hingga tab aktif...')
                        // Tunggu hingga tab menjadi visible, lalu detect
                        const onVisible = () => {
                            if (document.visibilityState === 'visible') {
                                document.removeEventListener('visibilitychange', onVisible)
                                // Double-check cache lagi (mungkin tab lain sudah detect halaman yang sama)
                                getCacheFromBackground(pageKey).then(freshCache => {
                                    if (freshCache) {
                                        console.log('[Judol Detector] Cache tersedia setelah tab visible, pakai cache.')
                                        if (freshCache.is_judol) {
                                            isPageJudol = true
                                            isFromCache = true
                                            wasCachedAtStartup = true
                                            hasShownWarning = true
                                            applyBlurFromCache(freshCache)
                                        } else {
                                            wasCachedAtStartup = true
                                        }
                                        // Simpan ke session storage via background
                                        safeSendMessage({
                                            type: 'PAGE_RESULT_FROM_CACHE',
                                            result: freshCache.result,
                                            fromCache: true
                                        }, () => { })
                                    } else {
                                        console.log('[Judol Detector] Tab sekarang visible, memulai deteksi...')
                                        collectAndSend()
                                    }
                                })
                            }
                        }
                        document.addEventListener('visibilitychange', onVisible)
                    }
                }
            }
        })
    }

    // Cek status global dan inisialisasi observer (hanya jika tab visible)
    if (isExtensionAlive()) {
        chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
            if (data.isActive && data.sensorActive && !isSearchEnginePage()) {
                // Hanya start observer jika tab sedang visible
                if (document.visibilityState === 'visible') {
                    startImageObserver()
                }
                // Listen for visibility changes to start/stop observer
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        if (isPageJudol && !isSearchEnginePage()) {
                            startImageObserver()
                        }
                    } else {
                        stopImageObserver() // Hemat resource saat tab tidak aktif
                    }
                })
            }
        })
    }

} // end of double-injection guard
