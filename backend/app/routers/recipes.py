from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import use_posiflora
from app.database import get_db
from app.services import catalog_read, posiflora

# Storefront catalog. Which shop answers is decided by CATALOG_SOURCE:
#   posiflora — proxied live from the vendor Posiflora (floree.ru today)
#   local     — served from our own database, filled by the admin import screen
# Both paths return the same JSON:API shape, so the frontend is unaware.
router = APIRouter(tags=["recipes"])


@router.get("/recipes")
async def list_recipes(
    category: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
):
    if use_posiflora():
        try:
            return await posiflora.get_recipes(category_id=category)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Posiflora: {e}")
    return await catalog_read.get_recipes(db, category_id=category)


@router.get("/recipes/{recipe_id}")
async def retrieve_recipe(recipe_id: str, db: AsyncSession = Depends(get_db)):
    if use_posiflora():
        try:
            return await posiflora.get_recipe(recipe_id)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Posiflora: {e}")
    recipe = await catalog_read.get_recipe(db, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.get("/recipe-categories")
async def list_recipe_categories(db: AsyncSession = Depends(get_db)):
    if use_posiflora():
        try:
            return await posiflora.get_recipe_categories()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Posiflora: {e}")
    return await catalog_read.get_recipe_categories(db)
