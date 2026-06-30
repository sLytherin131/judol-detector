/**
 * Content script khusus untuk halaman aduankonten.id
 * Menampilkan overlay "URL halaman berhasil disalin" jika dibuka dari Judol Detector
 */

(function() {
    // Cek apakah ada parameter ?from=judol
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'judol') return;

    // Tunggu halaman sedikit siap sebelum menampilkan overlay
    function showOverlay() {
        // Hapus parameter from=judol dari URL tanpa reload
        const url = new URL(window.location);
        url.searchParams.delete('from');
        window.history.replaceState({}, '', url);

        // Buat overlay
        const overlay = document.createElement('div');
        overlay.id = 'judol-copied-overlay';
        overlay.innerHTML = `
            <style>
                #judol-copied-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.35);
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    padding-top: 80px;
                    z-index: 2147483647;
                    animation: jd-fade-in 0.25s ease;
                    cursor: pointer;
                }
                #judol-copied-overlay .jd-copied-box {
                    background: #ffffff;
                    padding: 16px 28px;
                    border-radius: 10px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                    animation: jd-slide-down 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                }
                #judol-copied-overlay .jd-copied-text {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin: 0;
                }
                @keyframes jd-fade-in {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes jd-fade-out {
                    from { opacity: 1; }
                    to   { opacity: 0; }
                }
                @keyframes jd-slide-down {
                    from { opacity: 0; transform: translateY(-20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            </style>
            <div class="jd-copied-box">
                <p class="jd-copied-text">URL halaman berhasil disalin</p>
            </div>
        `;
        document.body.appendChild(overlay);

        // Klik overlay untuk dismiss
        overlay.addEventListener('click', dismiss);

        // Auto-hide setelah 3 detik
        setTimeout(dismiss, 3000);

        function dismiss() {
            if (!overlay.parentNode) return;
            overlay.style.animation = 'jd-fade-out 0.25s ease forwards';
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 250);
        }
    }

    // Jalankan saat DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showOverlay);
    } else {
        showOverlay();
    }
})();
