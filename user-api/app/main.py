from fastapi import FastAPI
from .database import init_db
from .routers.users import router as users_router

app = FastAPI(title="User API", version="1.0.0")

app.include_router(users_router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "user-api"}
