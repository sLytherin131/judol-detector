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
