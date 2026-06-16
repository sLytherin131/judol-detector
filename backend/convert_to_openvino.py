"""
convert_to_openvino.py — Konversi semua model PyTorch ke OpenVINO IR format
============================================================================

Jalankan SEKALI di lokal (bukan di HF Spaces):
    pip install openvino optimum-intel[openvino] torch torchvision transformers
    python convert_to_openvino.py

Output: weights/openvino/
    ├── resnet34_solo.xml + .bin        (ResNet34 dengan fc classifier)
    ├── resnet34_backbone.xml + .bin    (ResNet34 tanpa fc, output 512-dim)
    ├── indobert_solo.xml + .bin        (IndoBERT ForSequenceClassification)
    ├── indobert_backbone.xml + .bin    (IndoBERT AutoModel, output CLS 768-dim)
    └── fusion.xml + .bin              (FusionClassifier Self-Attention)

Setelah konversi, upload folder weights/openvino/ ke HF Spaces.
predictor.py akan otomatis mendeteksi dan menggunakan OpenVINO jika tersedia.
"""

import os
import sys
import gc
import torch
import torch.nn as nn
import numpy as np

# ── PATHS ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
OUTPUT_DIR = os.path.join(WEIGHTS_DIR, "openvino")
RESNET_PATH = os.path.join(WEIGHTS_DIR, "best_resnet34.pth")
INDOBERT_DIR = os.path.join(WEIGHTS_DIR, "indobert_solo")
FUSION_PATH = os.path.join(WEIGHTS_DIR, "final_fusion_model.pth")

# ── KONFIGURASI (harus sama dengan predictor.py) ──
VISUAL_DIM = 512
TEXT_DIM = 768
PROJ_DIM = 512
NUM_HEADS = 4
HIDDEN_DIM = 256
NUM_CLASSES = 2
DROPOUT = 0.4
MAX_LEN = 512

os.makedirs(OUTPUT_DIR, exist_ok=True)


def _cleanup(*objects):
    """Bebaskan memory setelah konversi."""
    for obj in objects:
        del obj
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _already_converted(name):
    """Cek apakah model sudah dikonversi (untuk resume)."""
    xml_path = os.path.join(OUTPUT_DIR, f"{name}.xml")
    bin_path = os.path.join(OUTPUT_DIR, f"{name}.bin")
    return os.path.exists(xml_path) and os.path.exists(bin_path)


# ═══════════════════════════════════════════════════════════
# WRAPPER MODELS (untuk export yang bersih ke ONNX/OpenVINO)
# ═══════════════════════════════════════════════════════════

class ResNet34SoloWrapper(nn.Module):
    """ResNet34 dengan fc = Linear(512, 2). Dropout di-skip karena eval mode."""
    def __init__(self):
        super().__init__()
        from torchvision import models
        self.model = models.resnet34(weights=None)
        # Ganti fc dengan Linear saja (tanpa Dropout — eval mode dropout=noop)
        self.model.fc = nn.Linear(self.model.fc.in_features, NUM_CLASSES)

    def forward(self, x):
        return self.model(x)


class ResNet34BackboneWrapper(nn.Module):
    """ResNet34 tanpa fc — output fitur 512-dim."""
    def __init__(self):
        super().__init__()
        from torchvision import models
        self.model = models.resnet34(weights=None)
        self.model.fc = nn.Identity()

    def forward(self, x):
        return self.model(x)


class IndoBERTBackboneWrapper(nn.Module):
    """IndoBERT AutoModel — output CLS token 768-dim."""
    def __init__(self):
        super().__init__()
        from transformers import AutoModel
        self.model = AutoModel.from_pretrained(INDOBERT_DIR)

    def forward(self, input_ids, attention_mask):
        outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
        return outputs.last_hidden_state[:, 0, :]  # CLS token → (B, 768)


# Import FusionClassifier dari predictor (atau redefinisi di sini)
class FusionClassifier(nn.Module):
    """Identik dengan FusionClassifier di predictor.py"""
    def __init__(self):
        super().__init__()
        self.proj_visual = nn.Sequential(
            nn.Linear(VISUAL_DIM, PROJ_DIM),
            nn.LayerNorm(PROJ_DIM),
            nn.ReLU(),
        )
        self.proj_text = nn.Sequential(
            nn.Linear(TEXT_DIM, PROJ_DIM),
            nn.LayerNorm(PROJ_DIM),
            nn.ReLU(),
        )
        self.self_attn = nn.MultiheadAttention(
            embed_dim=PROJ_DIM, num_heads=NUM_HEADS,
            dropout=DROPOUT, batch_first=False,
        )
        self.attn_norm = nn.LayerNorm(PROJ_DIM)
        self.classifier = nn.Sequential(
            nn.Linear(PROJ_DIM, HIDDEN_DIM),
            nn.ReLU(),
            nn.Dropout(p=DROPOUT),
            nn.Linear(HIDDEN_DIM, NUM_CLASSES),
        )

    def forward(self, visual_feat, text_feat):
        v = self.proj_visual(visual_feat)
        t = self.proj_text(text_feat)
        seq = torch.stack([v, t], dim=0)
        attn_out, _ = self.self_attn(seq, seq, seq)
        attn_out = self.attn_norm(attn_out + seq)
        fused = attn_out.mean(dim=0)
        logits = self.classifier(fused)
        return logits


# ═══════════════════════════════════════════════════════════
# KONVERSI STEP-BY-STEP
# ═══════════════════════════════════════════════════════════

def load_resnet_weights(model_wrapper, path):
    """Load state_dict ResNet34 ke wrapper (handle fc layer mismatch)."""
    state_dict = torch.load(path, map_location="cpu", weights_only=True)

    # fc layer di state_dict punya kunci fc.1.weight, fc.1.bias (karena Sequential)
    # Kita perlu mapping ke wrapper yang punya fc.weight, fc.bias (Linear langsung)
    new_state_dict = {}
    for k, v in state_dict.items():
        if k == "fc.1.weight":
            new_state_dict["fc.weight"] = v
        elif k == "fc.1.bias":
            new_state_dict["fc.bias"] = v
        elif k.startswith("fc.0."):
            continue  # skip Dropout layer params
        else:
            new_state_dict[k] = v

    # Untuk backbone wrapper (fc=Identity), hapus semua fc.* keys
    if isinstance(model_wrapper.model.fc, nn.Identity):
        new_state_dict = {k: v for k, v in new_state_dict.items() if not k.startswith("fc.")}
        model_wrapper.model.load_state_dict(new_state_dict, strict=False)
    else:
        model_wrapper.model.load_state_dict(new_state_dict, strict=False)


def convert_resnet34_solo():
    """Konversi ResNet34 Solo (dengan classifier) → OpenVINO."""
    if _already_converted("resnet34_solo"):
        print("\n[1/5] ResNet34 Solo — sudah dikonversi, skip.")
        return
    print("\n[1/5] Konversi ResNet34 Solo...")
    model = ResNet34SoloWrapper()
    load_resnet_weights(model, RESNET_PATH)
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)

    try:
        import openvino as ov
        ov_model = ov.convert_model(model, example_input=dummy)
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "resnet34_solo.xml"))
        print("  ✓ ResNet34 Solo berhasil dikonversi")
    except Exception as e:
        print(f"  ✗ OpenVINO convert gagal: {e}")
        print("  → Coba export via ONNX dulu...")
        onnx_path = os.path.join(OUTPUT_DIR, "resnet34_solo.onnx")
        torch.onnx.export(model, dummy, onnx_path,
                          input_names=["image"], output_names=["logits"],
                          dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}})
        import openvino as ov
        ov_model = ov.convert_model(onnx_path)
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "resnet34_solo.xml"))
        os.remove(onnx_path)
        print("  ✓ ResNet34 Solo berhasil dikonversi (via ONNX)")

    _cleanup(model, dummy)


def convert_resnet34_backbone():
    """Konversi ResNet34 Backbone (fc=Identity, output 512-dim) → OpenVINO."""
    if _already_converted("resnet34_backbone"):
        print("\n[2/5] ResNet34 Backbone — sudah dikonversi, skip.")
        return
    print("\n[2/5] Konversi ResNet34 Backbone...")
    model = ResNet34BackboneWrapper()
    load_resnet_weights(model, RESNET_PATH)
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)

    try:
        import openvino as ov
        ov_model = ov.convert_model(model, example_input=dummy)
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "resnet34_backbone.xml"))
        print("  ✓ ResNet34 Backbone berhasil dikonversi")
    except Exception as e:
        print(f"  ✗ OpenVINO convert gagal: {e}")
        print("  → Coba export via ONNX dulu...")
        onnx_path = os.path.join(OUTPUT_DIR, "resnet34_backbone.onnx")
        torch.onnx.export(model, dummy, onnx_path,
                          input_names=["image"], output_names=["features"],
                          dynamic_axes={"image": {0: "batch"}, "features": {0: "batch"}})
        import openvino as ov
        ov_model = ov.convert_model(onnx_path)
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "resnet34_backbone.xml"))
        os.remove(onnx_path)
        print("  ✓ ResNet34 Backbone berhasil dikonversi (via ONNX)")

    _cleanup(model, dummy)


def convert_indobert_solo():
    """Konversi IndoBERT ForSequenceClassification → OpenVINO."""
    if _already_converted("indobert_solo"):
        print("\n[3/5] IndoBERT Solo — sudah dikonversi, skip.")
        return
    print("\n[3/5] Konversi IndoBERT Solo...")

    try:
        # Cara termudah: pakai optimum-intel
        from optimum.intel import OVModelForSequenceClassification
        model = OVModelForSequenceClassification.from_pretrained(
            INDOBERT_DIR,
            export=True,
            num_labels=NUM_CLASSES,
        )
        model.save_pretrained(OUTPUT_DIR + "/indobert_solo_ov")

        # Rename/move files
        import shutil
        ov_dir = os.path.join(OUTPUT_DIR, "indobert_solo_ov")
        for f in os.listdir(ov_dir):
            if f.startswith("openvino_model"):
                ext = ".xml" if f.endswith(".xml") else ".bin"
                shutil.move(
                    os.path.join(ov_dir, f),
                    os.path.join(OUTPUT_DIR, f"indobert_solo{ext}")
                )
        shutil.rmtree(ov_dir, ignore_errors=True)
        print("  ✓ IndoBERT Solo berhasil dikonversi (via optimum-intel)")
        _cleanup(model)

    except ImportError:
        print("  → optimum-intel tidak tersedia, pakai manual export...")
        _convert_indobert_solo_manual()


def _convert_indobert_solo_manual():
    """Fallback: export IndoBERT via ONNX → OpenVINO."""
    from transformers import AutoModelForSequenceClassification

    model = AutoModelForSequenceClassification.from_pretrained(
        INDOBERT_DIR, num_labels=NUM_CLASSES
    )
    model.eval()

    dummy_ids = torch.ones(1, MAX_LEN, dtype=torch.long)
    dummy_mask = torch.ones(1, MAX_LEN, dtype=torch.long)

    onnx_path = os.path.join(OUTPUT_DIR, "indobert_solo.onnx")
    torch.onnx.export(
        model,
        (dummy_ids, dummy_mask),
        onnx_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch"}, "attention_mask": {0: "batch"},
            "logits": {0: "batch"},
        },
    )

    # Bebaskan model PyTorch sebelum konversi OpenVINO
    del model, dummy_ids, dummy_mask
    gc.collect()

    import openvino as ov
    ov_model = ov.convert_model(onnx_path)
    ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "indobert_solo.xml"))
    os.remove(onnx_path)
    del ov_model
    gc.collect()
    print("  ✓ IndoBERT Solo berhasil dikonversi (via ONNX)")


def convert_indobert_backbone():
    """Konversi IndoBERT AutoModel (CLS token 768-dim) → OpenVINO."""
    if _already_converted("indobert_backbone"):
        print("\n[4/5] IndoBERT Backbone — sudah dikonversi, skip.")
        return
    print("\n[4/5] Konversi IndoBERT Backbone...")
    model = IndoBERTBackboneWrapper()
    model.eval()

    dummy_ids = torch.ones(1, MAX_LEN, dtype=torch.long)
    dummy_mask = torch.ones(1, MAX_LEN, dtype=torch.long)

    try:
        import openvino as ov
        ov_model = ov.convert_model(
            model,
            example_input={"input_ids": dummy_ids, "attention_mask": dummy_mask},
        )
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "indobert_backbone.xml"))
        print("  ✓ IndoBERT Backbone berhasil dikonversi")
    except Exception as e:
        print(f"  ✗ OpenVINO convert gagal: {e}")
        print("  → Coba export via ONNX dulu...")
        onnx_path = os.path.join(OUTPUT_DIR, "indobert_backbone.onnx")
        torch.onnx.export(
            model, (dummy_ids, dummy_mask), onnx_path,
            input_names=["input_ids", "attention_mask"],
            output_names=["cls_features"],
            dynamic_axes={
                "input_ids": {0: "batch"}, "attention_mask": {0: "batch"},
                "cls_features": {0: "batch"},
            },
        )
        import openvino as ov
        ov_model = ov.convert_model(onnx_path)
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "indobert_backbone.xml"))
        os.remove(onnx_path)
        print("  ✓ IndoBERT Backbone berhasil dikonversi (via ONNX)")

    _cleanup(model, dummy_ids, dummy_mask)


def convert_fusion():
    """Konversi FusionClassifier (Self-Attention) → OpenVINO."""
    if _already_converted("fusion"):
        print("\n[5/5] FusionClassifier — sudah dikonversi, skip.")
        return
    print("\n[5/5] Konversi FusionClassifier...")
    model = FusionClassifier()
    model.load_state_dict(torch.load(FUSION_PATH, map_location="cpu"))
    model.eval()

    dummy_vis = torch.randn(1, VISUAL_DIM)
    dummy_txt = torch.randn(1, TEXT_DIM)

    try:
        import openvino as ov
        ov_model = ov.convert_model(
            model,
            example_input=(dummy_vis, dummy_txt),
        )
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "fusion.xml"))
        print("  ✓ FusionClassifier berhasil dikonversi")
    except Exception as e:
        print(f"  ✗ OpenVINO convert gagal: {e}")
        print("  → Coba export via ONNX dulu...")
        onnx_path = os.path.join(OUTPUT_DIR, "fusion.onnx")
        torch.onnx.export(
            model, (dummy_vis, dummy_txt), onnx_path,
            input_names=["visual_feat", "text_feat"],
            output_names=["logits"],
            dynamic_axes={
                "visual_feat": {0: "batch"}, "text_feat": {0: "batch"},
                "logits": {0: "batch"},
            },
        )
        import openvino as ov
        ov_model = ov.convert_model(onnx_path)
        ov.save_model(ov_model, os.path.join(OUTPUT_DIR, "fusion.xml"))
        os.remove(onnx_path)
        print("  ✓ FusionClassifier berhasil dikonversi (via ONNX)")

    _cleanup(model, dummy_vis, dummy_txt)


# ═══════════════════════════════════════════════════════════
# VALIDASI: bandingkan output PyTorch vs OpenVINO
# ═══════════════════════════════════════════════════════════

def validate_models():
    """Cek apakah output OpenVINO mirip dengan PyTorch."""
    print("\n" + "=" * 50)
    print("VALIDASI: PyTorch vs OpenVINO")
    print("=" * 50)

    import openvino as ov
    core = ov.Core()

    # ── ResNet34 Solo ──
    try:
        from torchvision import models
        pt_model = ResNet34SoloWrapper()
        load_resnet_weights(pt_model, RESNET_PATH)
        pt_model.eval()

        dummy = torch.randn(1, 3, 224, 224)
        pt_out = pt_model(dummy).detach().numpy()

        ov_model = core.compile_model(os.path.join(OUTPUT_DIR, "resnet34_solo.xml"), "CPU")
        ov_out = ov_model(dummy.numpy())[0]

        diff = np.max(np.abs(pt_out - ov_out))
        status = "✓" if diff < 0.01 else "⚠"
        print(f"  {status} ResNet34 Solo  — max diff: {diff:.6f}")
    except Exception as e:
        print(f"  ✗ ResNet34 Solo validasi gagal: {e}")

    # ── IndoBERT Solo ──
    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        pt_model = AutoModelForSequenceClassification.from_pretrained(
            INDOBERT_DIR, num_labels=NUM_CLASSES
        )
        pt_model.eval()
        tok = AutoTokenizer.from_pretrained(INDOBERT_DIR)

        # Pakai input yang lebih realistis (bukan all-ones)
        enc = tok("ini adalah teks contoh untuk validasi model", max_length=MAX_LEN,
                  truncation=True, padding="max_length", return_tensors="pt")
        dummy_ids = enc["input_ids"]
        dummy_mask = enc["attention_mask"]
        dummy_type = enc.get("token_type_ids", torch.zeros_like(dummy_ids))
        with torch.no_grad():
            pt_out = pt_model(input_ids=dummy_ids, attention_mask=dummy_mask).logits.numpy()

        ov_model = core.compile_model(os.path.join(OUTPUT_DIR, "indobert_solo.xml"), "CPU")
        ov_out = ov_model({
            "input_ids": dummy_ids.numpy(),
            "attention_mask": dummy_mask.numpy(),
            "token_type_ids": dummy_type.numpy(),
        })[0]

        diff = np.max(np.abs(pt_out - ov_out))
        status = "✓" if diff < 0.01 else "⚠"
        print(f"  {status} IndoBERT Solo   — max diff: {diff:.6f}")
    except Exception as e:
        print(f"  ✗ IndoBERT Solo validasi gagal: {e}")

    # ── Fusion ──
    try:
        pt_model = FusionClassifier()
        pt_model.load_state_dict(torch.load(FUSION_PATH, map_location="cpu", weights_only=True))
        pt_model.eval()

        dummy_vis = torch.randn(1, VISUAL_DIM)
        dummy_txt = torch.randn(1, TEXT_DIM)
        with torch.no_grad():
            pt_out = pt_model(dummy_vis, dummy_txt)[0].numpy()  # [0] = logits (abaikan attn_weights)

        ov_model = core.compile_model(os.path.join(OUTPUT_DIR, "fusion.xml"), "CPU")
        ov_result = ov_model({"visual_feat": dummy_vis.numpy(), "text_feat": dummy_txt.numpy()})
        ov_out = ov_result[0]  # output pertama = logits

        diff = np.max(np.abs(pt_out - ov_out))
        status = "✓" if diff < 0.01 else "⚠"
        print(f"  {status} Fusion          — max diff: {diff:.6f}")
    except Exception as e:
        print(f"  ✗ Fusion validasi gagal: {e}")

    print(f"\n{'=' * 50}")
    print("Validasi selesai.")


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 50)
    print("Konversi Model PyTorch → OpenVINO")
    print("=" * 50)
    print(f"  Weights dir : {WEIGHTS_DIR}")
    print(f"  Output dir  : {OUTPUT_DIR}")
    print(f"  Device      : CPU")

    # Cek file weights
    for name, path in [("ResNet34", RESNET_PATH), ("IndoBERT", INDOBERT_DIR), ("Fusion", FUSION_PATH)]:
        if not os.path.exists(path):
            print(f"\n✗ ERROR: {name} tidak ditemukan di {path}")
            sys.exit(1)

    # Konversi semua model (dengan gc.collect() di antara setiap step untuk hemat memory)
    convert_resnet34_solo()
    gc.collect()
    convert_resnet34_backbone()
    gc.collect()
    convert_indobert_solo()
    gc.collect()
    convert_indobert_backbone()
    gc.collect()
    convert_fusion()
    gc.collect()

    # Validasi
    validate_models()

    print(f"\n✓ Selesai! Upload folder '{OUTPUT_DIR}' ke HF Spaces.")
    print(f"  predictor.py akan otomatis menggunakan OpenVINO jika folder ini ada.")
