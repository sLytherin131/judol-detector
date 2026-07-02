from pydantic import BaseModel
from typing import Optional, List

class PredictRequest(BaseModel):
    text      : str
    image_b64 : Optional[str] = None        # base64 gambar utama (single)
    images_b64: Optional[List[str]] = None  # base64 list gambar (multi)
    url       : Optional[str] = None

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
