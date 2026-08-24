# Judol Detector

**Judol Detector** adalah ekstensi browser berbasis AI yang mendeteksi dan menyensor konten promosi judi online (*judol*) secara real-time saat browsing. Proyek ini menggabungkan model deep learning multimodal (teks + gambar) dengan antarmuka ekstensi Chrome yang ringan dan intuitif.

---

## Cara Kerja

Setiap halaman yang dikunjungi dianalisis menggunakan tiga pipeline secara bersamaan:

- **Analisis Gambar** — ResNet34 fine-tuned untuk mendeteksi visual konten judol (banner, poster, iklan grafis)
- **Analisis Teks** — IndoBERT fine-tuned untuk memahami konteks teks berbahasa Indonesia
- **Analisis Fusion** — FusionClassifier berbasis Self-Attention yang menggabungkan fitur visual dan teks untuk prediksi akhir

Ketiga skor digabung dengan *weighted late fusion* untuk menghasilkan confidence score final. Jika skor melampaui threshold, halaman dianggap sebagai situs promosi judol.

---

## Arsitektur

```
Judol Detector
├── backend/                    # FastAPI inference server
│   ├── main.py                 # Entry point (CORS, routing)
│   ├── routers/
│   │   └── predict.py          # Endpoint: /predict, /predict-image, /predict-text
│   ├── schemas/
│   │   └── request.py          # Pydantic request/response models
│   ├── services/
│   │   └── predictor.py        # Model loading & inference logic
│   ├── weights/
│   │   ├── best_resnet34.pth           # ResNet34 solo checkpoint
│   │   ├── final_fusion_model.pth      # FusionClassifier checkpoint
│   │   ├── late_fusion_alpha.json      # Alpha weights late fusion
│   │   ├── indobert_solo/              # IndoBERT fine-tuned weights
│   │   └── openvino/                   # OpenVINO IR models (optional)
│   ├── convert_to_openvino.py  # Script konversi PyTorch → OpenVINO
│   ├── Dockerfile              # Container untuk deployment (HF Spaces)
│   └── requirements.txt
│
└── extension/                  # Chrome Extension (Manifest V3)
    ├── manifest.json
    ├── background/
    │   └── background.js       # Service worker: API call, caching, retry
    ├── content/
    │   ├── content.js          # Injeksi halaman: deteksi, blur, sensor
    │   └── komdigi.js          # Script khusus aduankonten.id
    ├── popup/
    │   ├── popup.html          # UI popup ekstensi
    │   └── popup.js            # Logika popup (toggle, skor, blocklist)
    ├── blocklist/
    │   ├── blocklist.html      # Halaman manajemen daftar blokir
    │   └── blocklist.js
    ├── blocked.html            # Halaman redirect saat situs diblokir
    └── blocked.js
```

---

## Fitur Utama

- **Deteksi real-time** — setiap halaman dianalisis otomatis saat dibuka
- **Multi-image support** — mengirim hingga 5 gambar per halaman ke model
- **Blur/sensor konten** — gambar dan teks judol diblur dengan overlay hitam
- **Deteksi iklan sponsor** — mendeteksi banner judol di situs film/konten tanpa perlu API
- **Cache per halaman** — hasil deteksi disimpan agar tidak scan ulang
- **Blocklist** — pengguna bisa memblokir domain dan redirect ke halaman blokir
- **Lapor ke Komdigi** — integrasi dengan aduankonten.id untuk pelaporan
- **OpenVINO acceleration** — inferensi lebih cepat di CPU menggunakan OpenVINO IR
- **Retry & cold start handling** — background script retry otomatis jika API belum siap

---

## Model

| Model | Arsitektur | Tugas |
|-------|-----------|-------|
| ResNet34 Solo | ResNet34 + Dropout + Linear(512, 2) | Klasifikasi gambar judol |
| ResNet34 Backbone | ResNet34 (fc=Identity) | Ekstraksi fitur visual 512-dim |
| IndoBERT Solo | BERT (fine-tuned) + Classifier | Klasifikasi teks judol |
| IndoBERT Backbone | BERT (shared dari Solo) | Ekstraksi CLS token 768-dim |
| FusionClassifier | Self-Attention + FC | Late fusion multimodal |

**Late Fusion Formula:**

```
final = α₁ × conf_V + α₂ × conf_T + α₃ × conf_F
```

Alpha default: `α₁=0.41, α₂=0.10, α₃=0.49` (dikonfigurasi via `late_fusion_alpha.json`)

---

## Backend API

Server berjalan di atas **FastAPI** dengan **Uvicorn**.

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| `POST` | `/predict` | Multimodal: teks + gambar (base64) |
| `POST` | `/predict-image` | Image-only (ResNet34 solo) |
| `POST` | `/predict-text` | Text-only (IndoBERT solo) |
| `GET/HEAD` | `/health` | Health check |

### Request `/predict`

```json
{
  "text": "string",
  "image_b64": "string (optional)",
  "images_b64": ["string", "..."] ,
  "url": "string (optional)",
  "has_judol_ad": false
}
```

### Response `/predict`

```json
{
  "is_judol": true,
  "confidence_image": 0.82,
  "confidence_text": 0.74,
  "confidence_fusion": 0.91,
  "final_confidence": 0.87,
  "threshold": 0.60
}
```

---

## Menjalankan Backend

### Lokal

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Docker

```bash
cd backend
docker build -t judol-detector-api .
docker run -p 7860:7860 judol-detector-api
```

> Backend di-deploy ke **Hugging Face Spaces** dan berjalan di port `7860`.

---

## Konversi ke OpenVINO (Opsional)

OpenVINO mempercepat inferensi secara signifikan di CPU. Jalankan sekali di lokal:

```bash
pip install openvino optimum-intel[openvino] torch torchvision transformers
cd backend
python convert_to_openvino.py
```

Output disimpan ke `backend/weights/openvino/`. Upload folder ini ke deployment — `predictor.py` akan otomatis mendeteksi dan menggunakannya.

---

## Instalasi Ekstensi (Chrome/Chromium)

1. Buka `chrome://extensions/`
2. Aktifkan **Developer mode** (pojok kanan atas)
3. Klik **Load unpacked** → pilih folder `extension/`
4. Ekstensi siap digunakan

> Pastikan backend API sudah berjalan dan URL-nya sudah dikonfigurasi di `background/background.js`.

---

## Stack Teknologi

**Backend**
- Python 3.11
- FastAPI + Uvicorn
- PyTorch + torchvision
- HuggingFace Transformers (IndoBERT)
- OpenVINO (opsional, accelerated inference)
- Docker (deployment ke HF Spaces)

**Extension**
- JavaScript (Vanilla, Manifest V3)
- Chrome Extension APIs (storage, scripting, tabs)
- Font: Nohemi Variable Font

---

## Struktur Deteksi (Extension)

Alur kerja content script saat halaman dibuka:

```
1. Cek cache → jika ada hasil sebelumnya, langsung blur dari cache
2. Blur iklan sponsor (keyword-based, tanpa API) — langsung saat halaman dimuat
3. Ekstrak teks halaman (judul, meta, heading, paragraf, anchor, CTA)
4. Ekstrak gambar halaman (max 5, prioritas gambar iklan judol)
5. Konversi gambar ke base64 melalui background script (bypass CORS)
6. Kirim ke API → terima hasil deteksi
7. Jika judol: tampilkan overlay warning → blur gambar & teks judol
8. Simpan hasil ke cache (per halaman)
```

---

## Kontribusi

Pull request dan issue sangat disambut. Beberapa area yang bisa dikembangkan:

- Penambahan dataset gambar dan teks judol
- Peningkatan akurasi model (fine-tuning lebih lanjut)
- Support Firefox (WebExtensions API)
- Dashboard statistik deteksi
