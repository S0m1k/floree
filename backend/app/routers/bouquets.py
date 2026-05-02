from fastapi import APIRouter, HTTPException
from app.services.posiflora import get_bouquets, get_bouquet

router = APIRouter(prefix="/bouquets", tags=["bouquets"])


@router.get("")
async def list_bouquets():
    try:
        return await get_bouquets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{bouquet_id}")
async def retrieve_bouquet(bouquet_id: str):
    try:
        return await get_bouquet(bouquet_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
