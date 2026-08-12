from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.catalog_read import (
    get_recipe,
    get_recipe_categories,
    get_recipes,
)

# Storefront catalog — served entirely from our own database. Posiflora is no
# longer consulted at request time; data arrives via the admin import screen.
router = APIRouter(tags=["recipes"])


@router.get("/recipes")
async def list_recipes(
    category: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
):
    return await get_recipes(db, category_id=category)


@router.get("/recipes/{recipe_id}")
async def retrieve_recipe(recipe_id: str, db: AsyncSession = Depends(get_db)):
    recipe = await get_recipe(db, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.get("/recipe-categories")
async def list_recipe_categories(db: AsyncSession = Depends(get_db)):
    return await get_recipe_categories(db)
