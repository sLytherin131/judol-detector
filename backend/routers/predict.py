from fastapi import APIRouter, HTTPException
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
        result = predict_all(
            b64_str    = request.image_b64,
            images_b64 = request.images_b64,
            text       = request.text,
        )
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
        conf = predict_image_solo(request.image_b64)
        return {
            "is_judol"  : conf >= 0.5,
            "confidence": round(conf, 4),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
