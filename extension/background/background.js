const API_URL = 'https://ricky131-judol-detector-backend.hf.space'

// ── CACHE CONFIG ──
const CACHE_PREFIX = 'detcache_'

// ── DETECTION CACHE HELPERS (chrome.storage.local) ──
// Key: detcache_{hostname}  Value: { is_judol, result, blurredImages, blurredTextSelectors, timestamp }
// Tanpa expired (TTL) dan tanpa limit jumlah entry.

async function saveDetectionCache(hostname, data) {
    try {
        const cacheKey = CACHE_PREFIX + hostname
        await chrome.storage.local.set({
            [cacheKey]: {
                ...data,
                timestamp: Date.now()
            }
        })
    } catch (e) {
        console.warn('[background] Gagal simpan cache:', e)
    }
}

async function getDetectionCache(hostname) {
    const cacheKey = CACHE_PREFIX + hostname
    return new Promise(resolve => {
        chrome.storage.local.get([cacheKey], data => {
            const entry = data[cacheKey]
            resolve(entry || null)
        })
    })
}

async function clearAllDetectionCache() {
    const allData = await chrome.storage.local.get(null)
    const cacheKeys = Object.keys(allData).filter(k => k.startsWith(CACHE_PREFIX))
    if (cacheKeys.length > 0) {
        await chrome.storage.local.remove(cacheKeys)
    }
}

// ── STORAGE HELPERS (pakai session storage agar tidak hilang saat SW mati) ──
async function saveResult(tabId, result) {
    const key = `result_${tabId}`;
    return chrome.storage.session.set({ [key]: result });
}

async function getResult(tabId) {
    const key = `result_${tabId}`;
    return new Promise(resolve => {
        chrome.storage.session.get([key], data => {
            resolve(data[key] || null);
        });
    });
}

async function clearResult(tabId) {
    const key = `result_${tabId}`;
    return chrome.storage.session.remove([key]);
}

// Set status default saat instalasi pertama kali
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['isActive', 'sensorActive'], (data) => {
        if (data.isActive === undefined) {
            chrome.storage.local.set({ isActive: true })
        }
        if (data.sensorActive === undefined) {
            chrome.storage.local.set({ sensorActive: false })
        }
    })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.type === 'PAGE_DATA') {
        const tabId = sender.tab.id
        const hostname = (() => { try { return new URL(message.url).hostname } catch { return '' } })()

        // Cek apakah ekstensi aktif (dari storage)
        chrome.storage.local.get(['isActive'], async (data) => {
            if (!data.isActive) return

            let result = null
            let fromCache = false

            // Cek cache dulu sebelum panggil API
            if (hostname) {
                const cached = await getDetectionCache(hostname)
                if (cached) {
                    result = cached.result
                    fromCache = true
                    console.log(`[background] Cache hit untuk ${hostname}:`, cached.is_judol ? 'JUDOL' : 'AMAN')
                }
            }

            // Jika tidak ada cache, panggil API
            if (!result) {
                result = await callAPI(message)

                // Jika API gagal (null), jangan simpan cache & jangan label apapun
                if (!result) {
                    console.warn('[background] API tidak merespons, deteksi dilewati untuk halaman ini.')
                    // Sembunyikan loading indicator di content script
                    chrome.tabs.sendMessage(tabId, { type: 'HIDE_LOADING' }).catch(() => {})
                    return
                }

                // Simpan hasil ke cache (hanya untuk domain valid)
                if (hostname) {
                    await saveDetectionCache(hostname, {
                        is_judol: result.is_judol,
                        result: result,
                        blurredImages: [],
                        blurredTextSelectors: []
                    })
                }
            }

            // Simpan ke session storage (untuk popup)
            await saveResult(tabId, result)

            if (result.is_judol) {
                chrome.action.setBadgeText({ text: '!', tabId })
                chrome.action.setBadgeBackgroundColor({ color: '#EA4335', tabId })
            } else {
                chrome.action.setBadgeText({ text: '', tabId })
            }

            // Kirim hasil ke content script (tandai apakah dari cache)
            chrome.tabs.sendMessage(tabId, {
                type      : 'PAGE_RESULT',
                result    : result,
                fromCache : fromCache
            }).catch(err => {
                console.log(`[background] Info: Gagal mengirim pesan ke tab ${tabId} (mungkin tab ditutup/direfresh).`, err.message);
            })
        })
    }

    if (message.type === 'GET_RESULT') {
        // Async handler: baca dari session storage
        getResult(message.tabId).then(result => {
            sendResponse(result);
        });
        return true; // keep channel open for async response
    }

    if (message.type === 'CONVERT_TO_BASE64') {
        imageUrlToBase64(message.url).then(base64 => {
            sendResponse({ base64: base64 });
        }).catch(err => {
            sendResponse({ base64: null });
        });
        return true;
    }

    if (message.type === 'PREDICT_IMAGE') {
        // Retry logic untuk PREDICT_IMAGE juga
        (async () => {
            for (let attempt = 1; attempt <= API_RETRY_COUNT + 1; attempt++) {
                try {
                    const res = await fetch(`${API_URL}/predict-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image_b64: message.base64 })
                    })
                    const result = await res.json()
                    sendResponse(result)
                    return
                } catch (e) {
                    console.warn(`[Judol Detector] PREDICT_IMAGE attempt ${attempt} gagal:`, e.message)
                    if (attempt < API_RETRY_COUNT + 1) {
                        await delay(API_RETRY_DELAY)
                    }
                }
            }
            sendResponse({ api_down: true })
        })()
        return true;
    }

    if (message.type === 'BLOCK_SITE') {
        chrome.storage.local.get(['blocklist'], (data) => {
            const blocklist = data.blocklist || []
            if (!blocklist.includes(message.url)) {
                blocklist.push(message.url)
                chrome.storage.local.set({ blocklist })
            }
        })
    }

    // Simpan data elemen yang di-blur ke cache
    if (message.type === 'SAVE_BLUR_CACHE') {
        const hostname = message.hostname
        if (hostname) {
            chrome.storage.local.get([CACHE_PREFIX + hostname], async (data) => {
                const existing = data[CACHE_PREFIX + hostname]
                if (existing) {
                    existing.blurredImages = message.blurredImages || existing.blurredImages
                    existing.blurredTextSelectors = message.blurredTextSelectors || existing.blurredTextSelectors
                    await chrome.storage.local.set({ [CACHE_PREFIX + hostname]: existing })
                } else {
                    // Buat entry baru jika belum ada
                    await saveDetectionCache(hostname, {
                        is_judol: true,
                        result: { is_judol: true, confidence_image: 0, confidence_text: 0, confidence_fusion: 0, final_confidence: 0 },
                        blurredImages: message.blurredImages || [],
                        blurredTextSelectors: message.blurredTextSelectors || []
                    })
                }
            })
        }
    }

    // Ambil cache deteksi untuk sebuah hostname (dipakai content script)
    if (message.type === 'GET_CACHE') {
        const hostname = message.hostname
        getDetectionCache(hostname).then(cached => {
            sendResponse(cached)
        })
        return true // async
    }

    // Hapus semua cache deteksi
    if (message.type === 'CLEAR_ALL_CACHE') {
        clearAllDetectionCache().then(() => {
            sendResponse({ success: true })
        })
        return true
    }
});

// Cek blocklist saat halaman dimuat
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return

    chrome.storage.local.get(['blocklist'], (data) => {
        const blocklist = data.blocklist || []
        try {
            const url = new URL(tab.url).hostname
            if (blocklist.includes(url)) {
                chrome.tabs.update(tabId, {
                    url: chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(url)}`)
                }).catch(() => {})
            }
        } catch (e) {
            // URL tidak valid (chrome://, about:, dll) — abaikan
        }
    })
})

// Bersihkan result dari session storage saat tab ditutup
chrome.tabs.onRemoved.addListener((tabId) => {
    clearResult(tabId);
})

// ── RETRY CONFIG ──
const API_RETRY_COUNT = 2       // jumlah retry jika gagal (total percobaan = 3)
const API_RETRY_DELAY = 5000    // delay antar retry dalam ms (5 detik, memberi waktu cold start)

// ── HELPER: delay ──
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// ── API CALL DENGAN RETRY ──
// Jika server sedang cold start (forced restart setiap ~48 jam),
// request pertama akan gagal/timeout. Retry otomatis setelah 5 detik.
async function callAPI(data) {
    for (let attempt = 1; attempt <= API_RETRY_COUNT + 1; attempt++) {
        try {
            const startTime = performance.now()
            const response = await fetch(`${API_URL}/predict`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({
                    text      : data.text,
                    image_b64 : data.mainImage,
                    images_b64: data.images,
                    url       : data.url
                })
            })
            const result = await response.json()
            const endTime = performance.now()
            console.log(`[Judol Detector] API latency: ${Math.round(endTime - startTime)}ms (attempt ${attempt})`)
            return result
        } catch (e) {
            console.warn(`[Judol Detector] API attempt ${attempt} gagal:`, e.message)
            if (attempt < API_RETRY_COUNT + 1) {
                console.log(`[Judol Detector] Retry dalam ${API_RETRY_DELAY / 1000} detik...`)
                await delay(API_RETRY_DELAY)
            }
        }
    }
    // Semua percobaan gagal — server down / tidak bisa dijangkau
    // Return null agar tidak melabeli halaman sebagai judol atau non-judol
    console.error('[Judol Detector] Semua percobaan API gagal, deteksi dilewati.')
    return null
}

// ── KONVERSI GAMBAR KE BASE64 (Dijalankan di background untuk bypass CORS) ──
async function imageUrlToBase64(url) {
    const MAX_SIZE = 224;  // ResNet34 input size
    const JPEG_QUALITY = 0.7;  // 70% quality
    
    try {
        console.log(`[background] Mencoba mengambil & konversi gambar: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`[background] ❌ Gagal fetch gambar (${response.status} ${response.statusText}): ${url}`);
            return null;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType && !contentType.startsWith('image/')) {
            console.error(`[background] ❌ Content-Type bukan gambar (${contentType}): ${url}`);
            return null;
        }

        if (contentType.includes('svg') || url.toLowerCase().includes('.svg')) {
            console.warn(`[background] ⚠️ Format SVG tidak didukung: ${url}`);
            return null;
        }

        // Compress image: resize to 224x224 + JPEG 70% quality
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        
        // Calculate scaled dimensions (maintain aspect ratio, fit within MAX_SIZE)
        let targetW = MAX_SIZE;
        let targetH = MAX_SIZE;
        const ratio = Math.min(MAX_SIZE / imageBitmap.width, MAX_SIZE / imageBitmap.height);
        if (ratio < 1) {
            targetW = Math.round(imageBitmap.width * ratio);
            targetH = Math.round(imageBitmap.height * ratio);
        }
        
        // Create OffscreenCanvas and draw resized image
        const canvas = new OffscreenCanvas(targetW, targetH);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);
        imageBitmap.close();
        
        // Export as JPEG with reduced quality
        const compressedBlob = await canvas.convertToBlob({ 
            type: 'image/jpeg', 
            quality: JPEG_QUALITY 
        });
        
        // Convert to base64
        const arrayBuffer = await compressedBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunk_size = 8192;
        for (let i = 0; i < bytes.byteLength; i += chunk_size) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
        }
        const base64 = btoa(binary);
        console.log(`[background] ✓ Berhasil kompresi & konversi ke base64 (${targetW}x${targetH}, panjang: ${base64.length})`);
        return base64;
    } catch (e) {
        console.error("[background] ❌ Gagal convert image ke base64:", e);
        return null;
    }
}
