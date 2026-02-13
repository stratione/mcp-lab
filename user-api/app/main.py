import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import init_db
from .routers.users import router as users_router

app = FastAPI(title="User API", version="1.0.0")

app.include_router(users_router)

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "user-api"}


@app.get("/")
def root():
    return FileResponse(os.path.join(static_dir, "index.html"))
