from fastapi import FastAPI, HTTPException
from .models import PromoteRequest, PromotionResponse
from .promote import init_db, get_db, promote_image

app = FastAPI(title="Promotion Service", version="1.0.0")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "promotion-service"}


@app.post("/promote", response_model=PromotionResponse, status_code=201)
async def promote(req: PromoteRequest):
    result = await promote_image(req.image_name, req.tag, req.promoted_by)
    return result


@app.get("/promotions", response_model=list[PromotionResponse])
def list_promotions():
    db = get_db()
    rows = db.execute("SELECT * FROM promotions ORDER BY id DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/promotions/{promotion_id}", response_model=PromotionResponse)
def get_promotion(promotion_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM promotions WHERE id = ?", (promotion_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="Promotion not found")
    return dict(row)
