from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import predict

app = FastAPI(title="Judol Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router)

@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {"status": "Judol Detector API running"}

@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}
