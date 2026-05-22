from fastapi import APIRouter, HTTPException, Query
from app.services.posiflora import get_recipes, get_recipe, get_recipe_categories

router = APIRouter(tags=["recipes"])


@router.get("/recipes")
async def list_recipes(category: str | None = Query(default=None)):
    try:
        return await get_recipes(category_id=category)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recipes/{recipe_id}")
async def retrieve_recipe(recipe_id: str):
    try:
        return await get_recipe(recipe_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recipe-categories")
async def list_recipe_categories():
    try:
        return await get_recipe_categories()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
