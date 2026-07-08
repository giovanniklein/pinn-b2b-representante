from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database

router = APIRouter()
DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]

DEFAULT_VITRINE_TITULO = 'Aqui frete é grátis'


@router.get('/')
@router.get('', include_in_schema=False)
async def obter_configuracoes(db: DbDep) -> dict:
    """Retorna configurações públicas da vitrine (título editável pelo ADM)."""

    doc = await db['configuracoes'].find_one({'tipo': 'app'}) or {}
    return {'vitrine_titulo': doc.get('vitrine_titulo') or DEFAULT_VITRINE_TITULO}
