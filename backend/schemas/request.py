from pydantic import BaseModel
from typing import Optional, List

class PredictRequest(BaseModel):
    text      : str = ""    # teks halaman (boleh kosong, akan diproses sebagai text-only)
    image_b64 : Optional[str] = None        # base64 gambar utama (single)
    images_b64: Optional[List[str]] = None  # base64 list gambar (multi)
    url       : Optional[str] = None
    has_judol_ad: Optional[bool] = False    # True jika extension mendeteksi iklan judol eksplisit di halaman

class PredictResponse(BaseModel):
    is_judol          : bool
    confidence_image  : float
    confidence_text   : float
    confidence_fusion : float
    final_confidence  : float
    threshold         : float

class PredictImageRequest(BaseModel):
    image_b64: str

class PredictTextRequest(BaseModel):
    text: str
