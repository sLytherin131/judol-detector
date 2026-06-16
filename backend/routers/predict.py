from fastapi import APIRouter, HTTPException
import asyncio
from schemas.request import PredictRequest, PredictResponse, PredictImageRequest
from services.predictor import predict_all, predict_image_solo

router = APIRouter()

# ─────────────────────────────────────────────────────────
# POST /predict   →  multimodal late fusion
# ─────────────────────────────────────────────────────────
@router.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """
    Terima teks + gambar (base64 opsional), jalankan:
        1. ResNet34 solo  → conf_image
        2. IndoBERT solo  → conf_text
        3. FusionModel    → conf_fusion  (concat embed → FC → Softmax)
    Final confidence = weighted average ketiga model.
    """
    try:
        n_images = len(request.images_b64) if request.images_b64 else (1 if request.image_b64 else 0)
        print(f"[API /predict] Text: '{request.text[:40]}...' | Gambar diterima: {n_images}")
        # Run CPU-bound prediction in thread pool (non-blocking)
        result = await asyncio.to_thread(
            predict_all,
            b64_str    = request.image_b64,
            images_b64 = request.images_b64,
            text       = request.text,
        )
        print(f"[API /predict] HASIL → is_judol={result['is_judol']}, "
              f"V={result['confidence_image']:.3f}, T={result['confidence_text']:.3f}, "
              f"F={result['confidence_fusion']:.3f}, final={result['final_confidence']:.3f}")
        return PredictResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────
# POST /predict-image   →  image-only (ResNet34 solo)
# ─────────────────────────────────────────────────────────
@router.post("/predict-image")
async def predict_image(request: PredictImageRequest):
    """Prediksi hanya dari gambar menggunakan ResNet34 solo."""
    try:
        b64_len = len(request.image_b64) if request.image_b64 else 0
        print(f"[API /predict-image] panjang_b64={b64_len}")
        # Run CPU-bound prediction in thread pool (non-blocking)
        conf = await asyncio.to_thread(predict_image_solo, request.image_b64)
        is_judol = conf >= 0.5
        print(f"[API /predict-image] conf={conf:.4f} → is_judol={is_judol}")
        return {
            "is_judol"  : is_judol,
            "confidence": round(conf, 4),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
