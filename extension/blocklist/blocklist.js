document.addEventListener('DOMContentLoaded', () => {
    const listEl            = document.getElementById('list');
    const countEl           = document.getElementById('blockedCount');
    const inputEl           = document.getElementById('inputDomain');
    const btnAddEl          = document.getElementById('btnAdd');
    const validationEl      = document.getElementById('validationMessage');
    const searchEl          = document.getElementById('searchBar');
    const emptyEl           = document.getElementById('emptyState');
    const emptyTitleEl      = document.getElementById('emptyTitle');
    const emptyDescEl       = document.getElementById('emptyDesc');
    const btnClearEl        = document.getElementById('btnClearAll');
    const modalEl           = document.getElementById('confirmModal');
    const btnCancelEl       = document.getElementById('btnModalCancel');
    const btnConfirmEl      = document.getElementById('btnModalConfirm');
    const toastContainerEl  = document.getElementById('toastContainer');

    let blocklist = [];

    /* ── TOAST ── */
    function toast(msg, type = 'ok') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        toastContainerEl.appendChild(el);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('show'));
        });
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 220);
        }, 2800);
    }

    /* ── URL / DOMAIN UTILS ──
       Simpan entry sebagai hostname saja (bersih), tapi terima input URL penuh.
       Ini memastikan blocking di background.js (yang match by hostname) tetap bekerja,
       sekaligus search bisa dilakukan dari URL maupun domain.
    */
    function normalizeEntry(raw) {
        const s = raw.trim().toLowerCase();
        // Kalau ada protocol, parse sebagai URL
        if (s.startsWith('http://') || s.startsWith('https://')) {
            try {
                const u = new URL(s);
                return u.hostname.replace(/^www\./, '');
            } catch {}
        }
        // Tidak ada protocol — buang www., path, port
        return s.replace(/^www\./, '').replace(/:\d+$/, '').split('/')[0];
    }

    function isValidEntry(s) {
        // Boleh domain biasa: example.com
        if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]{2,}$/i.test(s)) return true;
        // Boleh URL penuh: https://example.com/path
        try { new URL(s.startsWith('http') ? s : 'https://' + s); return true; } catch {}
        return false;
    }

    /* ── RENDER ── */
    function render(list, q = '') {
        listEl.innerHTML = '';
        countEl.textContent = list.length;
        btnClearEl.style.display = list.length > 0 ? 'block' : 'none';

        const filtered = q
            ? list.filter(u => u.toLowerCase().includes(q.toLowerCase()))
            : list;

        if (filtered.length === 0) {
            emptyEl.style.display = 'block';
            emptyTitleEl.textContent = q ? 'Tidak ditemukan' : 'Belum ada situs yang diblokir';
            emptyDescEl.textContent  = q ? `Tidak ada hasil untuk "${q}".`
                : 'Tambahkan domain secara manual di atas, atau biarkan ekstensi mendeteksi dan memblokir otomatis.';
            return;
        }

        emptyEl.style.display = 'none';

        filtered.forEach(url => {
            const li = document.createElement('li');
            li.className = 'list-item';

            /* favicon — gunakan hostname untuk favicon lookup */
            const fav = document.createElement('div');
            fav.className = 'favicon';

            const img = document.createElement('img');
            img.src = `https://www.google.com/s2/favicons?sz=32&domain=${url}`;
            img.alt = '';

            const letter = document.createElement('span');
            letter.className = 'favicon-letter';
            letter.textContent = url.charAt(0);

            img.onload  = () => { fav.innerHTML = ''; fav.appendChild(img); };
            img.onerror = () => { fav.innerHTML = ''; fav.appendChild(letter); };
            fav.appendChild(letter);

            const domain = document.createElement('span');
            domain.className = 'item-domain';
            domain.textContent = url;

            const left = document.createElement('div');
            left.className = 'item-left';
            left.appendChild(fav);
            left.appendChild(domain);

            /* delete button */
            const del = document.createElement('button');
            del.className = 'btn-del';
            del.title = 'Hapus';
            del.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>`;

            del.addEventListener('click', () => {
                li.classList.add('item-out');
                setTimeout(() => {
                    blocklist = blocklist.filter(u => u !== url);
                    chrome.storage.local.set({ blocklist }, () => {
                        render(blocklist, searchEl.value);
                        toast(`"${url}" dihapus dari daftar blokir.`, 'ok');
                    });
                }, 180);
            });

            li.appendChild(left);
            li.appendChild(del);
            listEl.appendChild(li);
        });
    }

    /* ── INIT ── */
    chrome.storage.local.get(['blocklist'], data => {
        blocklist = data.blocklist || [];
        render(blocklist);
    });

    /* ── ADD ── */
    function addEntry() {
        const raw = inputEl.value.trim();
        if (!raw) return;

        if (!isValidEntry(raw)) {
            inputEl.classList.add('invalid');
            validationEl.style.display = 'block';
            toast('Format tidak valid. Masukkan domain atau URL yang benar.', 'err');
            return;
        }

        inputEl.classList.remove('invalid');
        validationEl.style.display = 'none';

        // Normalize ke hostname agar kompatibel dengan background.js blocking
        const entry = normalizeEntry(raw);

        if (blocklist.includes(entry)) {
            toast(`"${entry}" sudah ada di daftar blokir.`, 'err');
            return;
        }

        blocklist.unshift(entry);
        chrome.storage.local.set({ blocklist }, () => {
            inputEl.value  = '';
            searchEl.value = '';
            render(blocklist);
            toast(`"${entry}" ditambahkan ke daftar blokir.`, 'ok');
        });
    }

    btnAddEl.addEventListener('click', addEntry);
    inputEl.addEventListener('keypress', e => { if (e.key === 'Enter') addEntry(); });
    inputEl.addEventListener('input', () => {
        inputEl.classList.remove('invalid');
        validationEl.style.display = 'none';
    });

    searchEl.addEventListener('input', e => render(blocklist, e.target.value));

    /* ── CLEAR ALL ── */
    btnClearEl.addEventListener('click', () => modalEl.classList.add('open'));

    function closeModal() { modalEl.classList.remove('open'); }

    btnCancelEl.addEventListener('click', closeModal);
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });

    btnConfirmEl.addEventListener('click', () => {
        blocklist = [];
        chrome.storage.local.set({ blocklist: [] }, () => {
            render([]);
            closeModal();
            toast('Semua blokir dihapus.', 'ok');
        });
    });
});
