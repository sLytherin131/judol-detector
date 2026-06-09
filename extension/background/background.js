const API_URL = 'https://ricky131-judol-detector-backend.hf.space'

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

        // Cek apakah ekstensi aktif (dari storage)
        chrome.storage.local.get(['isActive'], async (data) => {
            if (!data.isActive) return

            // Kirim ke API
            const result = await callAPI(message)
            
            // Simpan ke session storage (tidak hilang saat SW mati)
            await saveResult(tabId, result)

            if (result.is_judol) {
                chrome.action.setBadgeText({ text: '!', tabId })
                chrome.action.setBadgeBackgroundColor({ color: '#EA4335', tabId })
            } else {
                chrome.action.setBadgeText({ text: '', tabId })
            }

            // Kirim hasil ke content script
            chrome.tabs.sendMessage(tabId, {
                type   : 'PAGE_RESULT',
                result : result
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
        fetch(`${API_URL}/predict-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_b64: message.base64 })
        })
        .then(res => res.json())
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ is_judol: false }));
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

// ── DUMMY API CALL (ganti dengan model asli nanti) ──
async function callAPI(data) {
    try {
        const response = await fetch(`${API_URL}/predict`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({
                text      : data.text,
                image_b64 : data.mainImage,
                images_b64: data.images, // Kirim list 3 gambar base64 ke API
                url       : data.url
            })
        })
        return await response.json()
    } catch (e) {
        // Return dummy response selama API belum siap
        return {
            is_judol          : false,
            confidence_image  : 0.0,
            confidence_text   : 0.0,
            confidence_fusion : 0.0,
            final_confidence  : 0.0
        }
    }
}

// ── KONVERSI GAMBAR KE BASE64 (Dijalankan di background untuk bypass CORS) ──
async function imageUrlToBase64(url) {
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

        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const len = bytes.byteLength;
        const chunk_size = 8192;
        for (let i = 0; i < len; i += chunk_size) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
        }
        const base64 = btoa(binary);
        console.log(`[background] ✓ Berhasil konversi ke base64 (panjang: ${base64.length})`);
        return base64;
    } catch (e) {
        console.error("[background] ❌ Gagal convert image ke base64:", e);
        return null;
    }
}
