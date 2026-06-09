document.getElementById('btnManage').addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('blocklist/blocklist.html');
});

// Saat halaman dimuat, cek apakah domain masih diblokir.
// Kalau sudah dihapus dari blocklist (misal user hapus lalu back), langsung ke situs asli.
(function checkStillBlocked() {
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('domain');
    if (!domain) return;

    chrome.storage.local.get(['blocklist'], data => {
        const blocklist = data.blocklist || [];
        if (!blocklist.includes(domain)) {
            // Domain sudah tidak diblokir, redirect ke situs asli
            window.location.replace('https://' + domain);
        }
    });
})();
