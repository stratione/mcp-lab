from fastapi import FastAPI, HTTPException
from .models import (
    PromoteRequest,
    PromotionResponse,
    RollbackRequest,
    ScanCreateRequest,
    ScanResponse,
    ScanSummary,
    PolicyResponse,
)
from .promote import (
    PromotionBlocked,
    get_db,
    get_policy,
    init_db,
    promote_image,
    record_scan,
    rollback_image,
    row_to_promotion,
    row_to_scan,
)

app = FastAPI(title="Promotion Service", version="2.0.0")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "promotion-service"}


@app.get("/policy", response_model=PolicyResponse)
def policy():
    return get_policy()


@app.post("/promote", response_model=PromotionResponse, status_code=201)
async def promote(req: PromoteRequest):
    try:
        return await promote_image(
            req.image_name, req.tag, req.promoted_by, req.from_registry, req.to_registry
        )
    except PromotionBlocked as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.post("/rollback", response_model=PromotionResponse, status_code=201)
async def rollback(req: RollbackRequest):
    result = await rollback_image(req.image_name, req.tag, req.environment, req.rolled_back_by)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No previous successful promotion of {req.image_name}:{req.tag} "
                   f"to {req.environment} to roll back to",
        )
    return result


@app.get("/promotions", response_model=list[PromotionResponse])
def list_promotions():
    db = get_db()
    rows = db.execute("SELECT * FROM promotions ORDER BY id DESC").fetchall()
    db.close()
    return [row_to_promotion(r) for r in rows]


@app.get("/promotions/{promotion_id}", response_model=PromotionResponse)
def get_promotion(promotion_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM promotions WHERE id = ?", (promotion_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="Promotion not found")
    return row_to_promotion(row)


@app.post("/scans", response_model=ScanResponse, status_code=201)
def create_scan(req: ScanCreateRequest):
    return record_scan(
        req.image_name, req.tag, req.registry, req.scanned_by,
        req.critical, req.high, req.medium, req.low, req.total, req.report,
    )


@app.get("/scans", response_model=list[ScanSummary])
def list_scans(image_name: str = "", tag: str = "", registry: str = "", limit: int = 20):
    clauses, params = [], []
    for column, value in (("image_name", image_name), ("tag", tag), ("registry", registry)):
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit = max(1, min(limit, 200))
    db = get_db()
    rows = db.execute(
        f"SELECT * FROM scans {where} ORDER BY id DESC LIMIT ?", (*params, limit)
    ).fetchall()
    db.close()
    # report intentionally omitted from list responses (ScanSummary)
    return [row_to_scan(r) for r in rows]


@app.get("/scans/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="Scan not found")
    return row_to_scan(row)
