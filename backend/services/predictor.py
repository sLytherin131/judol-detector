"""
predictor.py — Late Fusion: ResNet34 + IndoBERT → Concat → FC → Softmax
=========================================================================

Arsitektur SESUAI notebook training:

  Image  : ResNet34 (fc=Identity) → 512-dim feature
  Text   : IndoBERT AutoModel, CLS token → 768-dim feature
  Fusion : Concat[512+768=1280] → Linear(1280,256) → ReLU → Dropout(0.3)
           → Linear(256,2) → Softmax

  Solo Image : ResNet34 dengan fc=Linear(512,2)
  Solo Text  : AutoModelForSequenceClassification (dari INDOBERT_PATH)

Late Fusion final:
  combined = α1 * prob_V + α2 * prob_T + α3 * prob_F
  Alpha terbaik (dari grid search): α1=0.5, α2=0.0, α3=0.5

File bobot yang diperlukan (taruh di backend/weights/):
  weights/best_resnet34.pth        ← state_dict ResNet34 dengan fc=Linear(512,2)
  ├── indobert_solo/           ← folder AutoModelForSequenceClassification
  │   ├── config.json
  │   ├── tokenizer_config.json
  │   ├── vocab.txt
  │   └── pytorch_model.bin
  ├── final_fusion_model.pth   ← state_dict FusionClassifier
  └── late_fusion_alpha.json   ← {"alpha_image":0.5,"alpha_text":0.0,"alpha_fusion":0.5}

Cara aktifkan: ubah MODEL_READY = True di bawah, lalu restart server.
"""

import os
import json
import torch
import base64
import numpy as np
from PIL import Image
from io import BytesIO
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
from torchvision import transforms, models
import torch.nn as nn

# ─────────────────────────────────────────────────────────────
# KONFIGURASI
# ─────────────────────────────────────────────────────────────
MODEL_READY = True   # ← ubah True setelah semua bobot tersedia

THRESHOLD   = 0.5     # ← bisa diganti nilai optimal dari ROC curve

# Default alpha (override oleh late_fusion_alpha.json jika ada)
ALPHA_IMAGE   = 0.5
ALPHA_TEXT    = 0.0
ALPHA_FUSION  = 0.5

# Dimensi fitur (harus sama dengan notebook)
VISUAL_DIM  = 512    # ResNet34 avg pool output
TEXT_DIM    = 768    # IndoBERT [CLS] hidden size
PROJ_DIM    = 512    # Self-Attention projection dim (harus bisa dibagi NUM_HEADS)
NUM_HEADS   = 4      # MultiheadAttention heads
HIDDEN_DIM  = 256    # hidden dim fusion FC
NUM_CLASSES = 2
DROPOUT     = 0.4
MAX_LEN     = 512

# ─── Paths ───
BASE_DIR      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS_DIR   = os.path.join(BASE_DIR, "weights")
RESNET_PATH   = os.path.join(WEIGHTS_DIR, "best_resnet34.pth")
INDOBERT_DIR  = os.path.join(WEIGHTS_DIR, "indobert_solo")
FUSION_PATH   = os.path.join(WEIGHTS_DIR, "final_fusion_model.pth")
ALPHA_PATH    = os.path.join(WEIGHTS_DIR, "late_fusion_alpha.json")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ─────────────────────────────────────────────────────────────
# ARSITEKTUR FUSION — Self-Attention (identik dengan notebook cell 12)
# ─────────────────────────────────────────────────────────────
class FusionClassifier(nn.Module):
    """
    Self-Attention Fusion:
    1. Project visual [512] dan text [768] ke proj_dim [512]
    2. Stack → sequence [2, B, proj_dim]
    3. MultiheadAttention → attended features
    4. Residual + LayerNorm → mean-pool → [proj_dim]
    5. FC → hidden_dim → num_classes

    Identik dengan SelfAttentionFusionClassifier di notebook cell 12.
    forward() mengembalikan (logits, attn_weights) — attn_weights diabaikan saat inference.
    """
    def __init__(self, visual_dim=VISUAL_DIM, text_dim=TEXT_DIM,
                 proj_dim=PROJ_DIM, hidden_dim=HIDDEN_DIM,
                 num_classes=NUM_CLASSES, dropout=DROPOUT, num_heads=NUM_HEADS):
        super().__init__()

        self.proj_visual = nn.Sequential(
            nn.Linear(visual_dim, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.ReLU(),
        )
        self.proj_text = nn.Sequential(
            nn.Linear(text_dim, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.ReLU(),
        )

        self.self_attn = nn.MultiheadAttention(
            embed_dim   = proj_dim,
            num_heads   = num_heads,
            dropout     = dropout,
            batch_first = False,
        )
        self.attn_norm = nn.LayerNorm(proj_dim)

        self.classifier = nn.Sequential(
            nn.Linear(proj_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(p=dropout),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, visual_feat, text_feat):
        v = self.proj_visual(visual_feat)       # [B, proj_dim]
        t = self.proj_text(text_feat)           # [B, proj_dim]

        seq = torch.stack([v, t], dim=0)        # [2, B, proj_dim]

        attn_out, attn_weights = self.self_attn(seq, seq, seq)
        attn_out = self.attn_norm(attn_out + seq)  # residual + norm

        fused  = attn_out.mean(dim=0)           # [B, proj_dim]
        logits = self.classifier(fused)         # [B, num_classes]
        return logits, attn_weights


# ─────────────────────────────────────────────────────────────
# LOAD ALPHA DARI JSON (jika ada)
# ─────────────────────────────────────────────────────────────
def _load_alpha():
    global ALPHA_IMAGE, ALPHA_TEXT, ALPHA_FUSION
    if os.path.exists(ALPHA_PATH):
        with open(ALPHA_PATH, "r") as f:
            cfg = json.load(f)
        ALPHA_IMAGE  = cfg.get("alpha_image",  ALPHA_IMAGE)
        ALPHA_TEXT   = cfg.get("alpha_text",   ALPHA_TEXT)
        ALPHA_FUSION = cfg.get("alpha_fusion", ALPHA_FUSION)
        print(f"[predictor] Alpha dimuat: V={ALPHA_IMAGE}, T={ALPHA_TEXT}, F={ALPHA_FUSION}")
    else:
        print(f"[predictor] late_fusion_alpha.json tidak ditemukan, pakai default: V={ALPHA_IMAGE}, T={ALPHA_TEXT}, F={ALPHA_FUSION}")


# ─────────────────────────────────────────────────────────────
# INISIALISASI MODEL GLOBAL
# ─────────────────────────────────────────────────────────────
resnet_solo_model    = None   # ResNet34 dengan fc=Linear(512,2) → untuk Prediction_V
resnet_backbone      = None   # ResNet34 dengan fc=Identity()    → untuk ekstraksi fitur fusion
indobert_solo_model  = None   # AutoModelForSequenceClassification → untuk Prediction_T
indobert_backbone    = None   # AutoModel                          → untuk ekstraksi fitur fusion
tokenizer            = None
fusion_model         = None


def load_models():
    """Load semua model ke memory. Dipanggil sekali saat startup."""
    global resnet_solo_model, resnet_backbone
    global indobert_solo_model, indobert_backbone
    global tokenizer, fusion_model

    _load_alpha()
    print(f"[predictor] Loading models ke {device}...")

    # ── 1. ResNet34 Solo (untuk Prediction_V) ──
    # Arsitektur: resnet34 + fc=Sequential(Dropout, Linear) sesuai notebook cell 10
    resnet_solo_model = models.resnet34(weights=None)
    resnet_solo_model.fc = nn.Sequential(
        nn.Dropout(p=0.4),
        nn.Linear(resnet_solo_model.fc.in_features, 2)
    )
    resnet_solo_model.load_state_dict(torch.load(RESNET_PATH, map_location=device))
    resnet_solo_model.eval().to(device)
    print(f"[predictor] [OK] ResNet34 solo loaded dari {RESNET_PATH}")

    # ── 2. ResNet34 Backbone (untuk ekstraksi fitur fusion) ──
    # Load dulu dengan arsitektur solo (Sequential fc), lalu ganti fc=Identity
    resnet_backbone = models.resnet34(weights=None)
    resnet_backbone.fc = nn.Sequential(
        nn.Dropout(p=0.4),
        nn.Linear(resnet_backbone.fc.in_features, 2)
    )
    resnet_backbone.load_state_dict(torch.load(RESNET_PATH, map_location=device))
    resnet_backbone.fc = nn.Identity()   # hapus FC terakhir → output (B,512)
    for param in resnet_backbone.parameters():
        param.requires_grad = False
    resnet_backbone.eval().to(device)
    print(f"[predictor] [OK] ResNet34 backbone (frozen) siap")

    # ── 3. Tokenizer ──
    tokenizer = AutoTokenizer.from_pretrained(INDOBERT_DIR)
    print(f"[predictor] [OK] Tokenizer loaded dari {INDOBERT_DIR}")

    # ── 4. IndoBERT Solo (untuk Prediction_T) ──
    # Seperti cell 19: AutoModelForSequenceClassification
    indobert_solo_model = AutoModelForSequenceClassification.from_pretrained(
        INDOBERT_DIR, num_labels=NUM_CLASSES
    )
    indobert_solo_model.eval().to(device)
    print(f"[predictor] [OK] IndoBERT solo (ForSequenceClassification) loaded")

    # ── 5. IndoBERT Backbone (dipinjam dari Solo untuk hemat RAM) ──
    # AutoModelForSequenceClassification sudah punya base model di .bert
    # Jadi kita TIDAK PERLU load model 1.6GB kedua kalinya!
    indobert_backbone = indobert_solo_model.bert
    for param in indobert_backbone.parameters():
        param.requires_grad = False
    print(f"[predictor] [OK] IndoBERT backbone (shared) siap - RAM dihemat!")

    # ── 6. Fusion Model ──
    fusion_model = FusionClassifier(
        visual_dim  = VISUAL_DIM,
        text_dim    = TEXT_DIM,
        proj_dim    = PROJ_DIM,
        hidden_dim  = HIDDEN_DIM,
        num_classes = NUM_CLASSES,
        dropout     = DROPOUT,
        num_heads   = NUM_HEADS,
    )
    fusion_model.load_state_dict(torch.load(FUSION_PATH, map_location=device))
    fusion_model.eval().to(device)
    print(f"[predictor] [OK] FusionClassifier (Self-Attention) loaded dari {FUSION_PATH}")
    print(f"[predictor] Semua model siap. Device: {device}")


if MODEL_READY:
    load_models()
else:
    print("[predictor] MODEL_READY=False → mode dummy aktif (return 0.0 untuk semua).")


# ─────────────────────────────────────────────────────────────
# PREPROCESSING
# ─────────────────────────────────────────────────────────────
img_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std =[0.229, 0.224, 0.225]
    ),
])

# Kalibrasi Probabilitas (mencegah model selalu 100% confidence / terlalu sensitif)
# Jika teks non-judol dianggap judol dengan confidence terlalu tinggi, naikkan nilai TEMPERATURE_TEXT (misal 2.0 atau 2.5)
TEMPERATURE_TEXT   = 5.5
TEMPERATURE_IMAGE  = 1.0  
TEMPERATURE_FUSION = 4.5


def _decode_image_safe(b64_str: str | None) -> torch.Tensor | None:
    """Base64 string → tensor (1, 3, 224, 224) di device. Mengembalikan None jika gagal."""
    if not b64_str or not isinstance(b64_str, str) or len(b64_str.strip()) == 0:
        return None
    img_bytes = b""
    try:
        # Hapus prefix data-uri jika ada (misal: "data:image/jpeg;base64,")
        if "," in b64_str:
            b64_str = b64_str.split(",")[1]
        img_bytes = base64.b64decode(b64_str)
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        return img_transform(img).unsqueeze(0).to(device)
    except Exception as e:
        # Tampilkan cuplikan konten asli jika gagal didecode
        sample = ""
        if img_bytes:
            try:
                sample = img_bytes[:100].decode('utf-8', errors='replace')
            except Exception:
                sample = str(img_bytes[:100])
        else:
            sample = b64_str[:100]
        print(f"[predictor] Warning: Gagal memproses gambar base64: {e}. (Sample content: {sample!r})")
        return None


def _encode_text(text: str) -> dict:
    """Teks → dict token tensors di device."""
    enc = tokenizer(
        text,
        max_length    = MAX_LEN,
        truncation    = True,
        padding       = "max_length",
        return_tensors= "pt",
    )
    return {k: v.to(device) for k, v in enc.items()}


# ─────────────────────────────────────────────────────────────
# EKSTRAKSI FITUR (identik dengan fungsi di notebook cell 14)
# ─────────────────────────────────────────────────────────────
@torch.no_grad()
def _extract_visual_features(image_tensor: torch.Tensor) -> torch.Tensor:
    """ResNet34 backbone (fc=Identity) → (1, 512)."""
    resnet_backbone.eval()
    return resnet_backbone(image_tensor)   # (B, 512)


@torch.no_grad()
def _extract_text_features(input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
    """IndoBERT AutoModel → CLS token → (1, 768)."""
    indobert_backbone.eval()
    outputs   = indobert_backbone(input_ids=input_ids, attention_mask=attention_mask)
    cls_token = outputs.last_hidden_state[:, 0, :]   # (B, 768)
    return cls_token


# ─────────────────────────────────────────────────────────────
# FUNGSI PREDIKSI PUBLIK
# ─────────────────────────────────────────────────────────────
def _prob_class1(logits: torch.Tensor) -> float:
    """Probabilitas class=1 (Judol) dari logits tensor."""
    return torch.softmax(logits, dim=1)[0][1].item()


def predict_image_solo(b64_str: str | None) -> float:
    """
    Prediction_V: ResNet34 solo → prob Judol [0,1].
    """
    if not MODEL_READY or resnet_solo_model is None:
        return 0.0
    img = _decode_image_safe(b64_str)
    if img is None:
        return 0.0
    with torch.no_grad():
        logits = resnet_solo_model(img)
        scaled_logits = logits / TEMPERATURE_IMAGE
    return _prob_class1(scaled_logits)


def predict_text_solo(text: str) -> float:
    """
    Prediction_T: IndoBERT AutoModelForSequenceClassification → prob Judol [0,1].
    Menerapkan temperature scaling untuk menghaluskan probabilitas.
    """
    if not MODEL_READY or indobert_solo_model is None:
        return 0.0
    enc = _encode_text(text)
    with torch.no_grad():
        out = indobert_solo_model(
            input_ids      = enc["input_ids"],
            attention_mask = enc["attention_mask"],
        )
        scaled_logits = out.logits / TEMPERATURE_TEXT
    return _prob_class1(scaled_logits)


def predict_fusion(b64_str: str | None, text: str) -> float:
    """
    Prediction_F: Ekstrak fitur ResNet34+IndoBERT → FusionClassifier → prob Judol.
    """
    if not MODEL_READY or fusion_model is None:
        return 0.0
    img = _decode_image_safe(b64_str)
    if img is None:
        return 0.0

    enc = _encode_text(text)
    with torch.no_grad():
        vis_feat = _extract_visual_features(img)
        txt_feat = _extract_text_features(enc["input_ids"], enc["attention_mask"])
        logits, _ = fusion_model(vis_feat, txt_feat)   # unpack (logits, attn_weights)
        scaled_logits = logits / TEMPERATURE_FUSION
    return _prob_class1(scaled_logits)


def predict_all(b64_str: str | None, text: str, images_b64: list[str] | None = None) -> dict:
    """
    Late Fusion Final (identik cell 21 notebook) dengan dukungan multi-image:
        - Mengekstrak visual features untuk seluruh gambar yang valid (maksimal 3).
        - Merata-ratakan visual feature vectors sebelum masuk ke Fusion Classifier.
        - Merata-ratakan confidence score solo image.
        - Menggunakan weighted sum: combined = α1 * prob_V + α2 * prob_T + α3 * prob_F

    Alpha diambil dari late_fusion_alpha.json (grid search terbaik: 0.5 / 0.0 / 0.5).
    Jika tidak ada gambar sama sekali, hanya pakai IndoBERT solo.
    """
    # Kumpulkan semua base64 gambar yang valid (maks 3)
    b64_list = []
    if images_b64 and isinstance(images_b64, list):
        b64_list = [b for b in images_b64[:3] if b]
    elif b64_str:
        b64_list = [b64_str]

    # Decode gambar-gambar tersebut menjadi tensor
    img_tensors = []
    for b64 in b64_list:
        t = _decode_image_safe(b64)
        if t is not None:
            img_tensors.append(t)

    has_image = len(img_tensors) > 0
    print(f"[API /predict] Text: '{text[:40]}...' | Jumlah gambar diproses: {len(img_tensors)}")

    conf_v = 0.0
    conf_f = 0.0

    if has_image:
        # 1. Prediction_V (Rata-rata probabilitas dari ResNet34 Solo untuk tiap gambar)
        conf_v_list = []
        for img in img_tensors:
            with torch.no_grad():
                logits_v = resnet_solo_model(img)
                prob_v = _prob_class1(logits_v / TEMPERATURE_IMAGE)
                conf_v_list.append(prob_v)
        conf_v = sum(conf_v_list) / len(conf_v_list)

        # 2. Prediction_F (Rata-rata fitur visual, lalu dicombine dengan teks)
        vis_feats = []
        for img in img_tensors:
            with torch.no_grad():
                feat = _extract_visual_features(img)  # (1, 512)
                vis_feats.append(feat)
        
        # Hitung rata-rata representasi fitur visual
        avg_vis_feat = torch.mean(torch.stack(vis_feats), dim=0)  # (1, 512)

        enc = _encode_text(text)
        with torch.no_grad():
            txt_feat = _extract_text_features(enc["input_ids"], enc["attention_mask"])
            logits_f, _ = fusion_model(avg_vis_feat, txt_feat)  # unpack (logits, attn_weights)
            conf_f = _prob_class1(logits_f / TEMPERATURE_FUSION)

    conf_t = predict_text_solo(text)

    if has_image:
        final = ALPHA_IMAGE * conf_v + ALPHA_TEXT * conf_t + ALPHA_FUSION * conf_f
    else:
        final = conf_t

    return {
        "is_judol"         : bool(final >= THRESHOLD),
        "confidence_image" : round(conf_v, 4),
        "confidence_text"  : round(conf_t, 4),
        "confidence_fusion": round(conf_f, 4),
        "final_confidence" : round(final,  4),
        "threshold"        : THRESHOLD,
    }
