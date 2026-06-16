const KOMDIGI_URL = 'https://aduankonten.id/';

document.addEventListener('DOMContentLoaded', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = new URL(tab.url).hostname;

    // Load toggle state
    chrome.storage.local.get(['isActive', 'sensorActive'], data => {
        const active = data.isActive || false;
        setToggle('toggleExtension', active);
        setToggle('toggleSensor', data.sensorActive || false);
        setStatus(active);
    });

    // Load detection result for this tab
    chrome.runtime.sendMessage({ type: 'GET_RESULT', tabId: tab.id }, result => {
        if (chrome.runtime.lastError) return;
        if (result) showResult(result);
    });

    // Cek apakah hasil untuk tab ini dari cache
    const hostname = (() => { try { return new URL(tab.url).hostname } catch { return '' } })();
    if (hostname) {
        chrome.runtime.sendMessage({ type: 'GET_CACHE', hostname }, cached => {
            if (chrome.runtime.lastError) return;
            if (cached) {
                document.getElementById('cacheInfo').style.display = 'block';
            }
        });
    }

    // Toggle ekstensi
    document.getElementById('toggleExtension').addEventListener('change', e => {
        const next = e.target.checked;
        chrome.storage.local.set({ isActive: next });
        setStatus(next);
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_EXTENSION', active: next }).catch(() => {});
    });

    // Toggle sensor
    document.getElementById('toggleSensor').addEventListener('change', e => {
        const next = e.target.checked;
        chrome.storage.local.set({ sensorActive: next });
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SENSOR', active: next }).catch(() => {});
    });

    // Action buttons
    document.getElementById('btnBlock').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'BLOCK_SITE', url });
        chrome.tabs.update(tab.id, {
            url: chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(url)}`)
        });
        window.close();
    });

    document.getElementById('btnReport').addEventListener('click', () => {
        chrome.tabs.create({ url: KOMDIGI_URL });
    });

    document.getElementById('linkBlocklist').addEventListener('click', e => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('blocklist/blocklist.html') });
    });

    // Hapus cache deteksi
    document.getElementById('linkClearCache').addEventListener('click', e => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: 'CLEAR_ALL_CACHE' }, response => {
            if (chrome.runtime.lastError) return;
            const link = document.getElementById('linkClearCache');
            link.textContent = 'Cache dihapus';
            link.style.color = 'var(--success)';
            document.getElementById('cacheInfo').style.display = 'none';
            setTimeout(() => {
                link.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Hapus Cache
                `;
                link.style.color = '';
            }, 2000);
        });
    });
});

function setToggle(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
}

function setStatus(active) {
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (active) {
        dot.classList.add('on');
        text.textContent = 'Aktif';
    } else {
        dot.classList.remove('on');
        text.textContent = 'Nonaktif';
    }
}

function showResult(result) {
    const pct = v => Math.round(v * 100);

    const vals = {
        image:  pct(result.confidence_image),
        text:   pct(result.confidence_text),
        fusion: pct(result.confidence_fusion),
        final:  pct(result.final_confidence),
    };

    if (result.is_judol) {
        // Tampilkan detection panel
        const panel = document.getElementById('detectionPanel');
        panel.style.display = 'block';

        // Update confidence text
        document.getElementById('confidenceText').textContent =
            `Tingkat keyakinan: ${vals.final}%`;

        // Update nilai label
        document.getElementById('confImage').textContent  = vals.image  + '%';
        document.getElementById('confText').textContent   = vals.text   + '%';
        document.getElementById('confFusion').textContent = vals.fusion + '%';
        document.getElementById('confFinal').textContent  = vals.final  + '%';

        // Animasi bar setelah render
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.getElementById('barImage').style.width  = vals.image  + '%';
                document.getElementById('barText').style.width   = vals.text   + '%';
                document.getElementById('barFusion').style.width = vals.fusion + '%';
                document.getElementById('barFinal').style.width  = vals.final  + '%';
            });
        });
    } else {
        // Tampilkan status aman
        const safeCard = document.getElementById('statusSafeCard');
        safeCard.style.display = 'flex';
    }
}
