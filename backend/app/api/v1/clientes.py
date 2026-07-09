from __future__ import annotations

from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.repositories.base import RepresentanteRepository, VarejistaLeituraRepository
from app.schemas.cliente import ClienteListItem, ClienteListResponse, cliente_to_response
from app.utils.dependencies import get_current_representante_id


router = APIRouter()

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteDep = Annotated[str, Depends(get_current_representante_id)]


@router.get("", response_model=ClienteListResponse)
@router.get("/", response_model=ClienteListResponse)
async def listar_clientes(
    db: DbDep,
    representante_id: RepresentanteDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None),
) -> ClienteListResponse:
    representante = await RepresentanteRepository(db).get_active_by_id(representante_id)
    if not representante:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Representante inativo")

    # O representante pode vender para QUALQUER cliente da plataforma.
    docs = await VarejistaLeituraRepository(db).listar_todos(q=q)
    total = len(docs)
    skip = (page - 1) * page_size
    items = [cliente_to_response(doc) for doc in docs[skip : skip + page_size]]
    total_pages = ceil(total / page_size) if total > 0 else 1
    return ClienteListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{cliente_id}", response_model=ClienteListItem)
async def obter_cliente(
    cliente_id: str,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ClienteListItem:
    representante_repo = RepresentanteRepository(db)
    representante = await representante_repo.get_active_by_id(representante_id)
    if not representante:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Representante inativo")

    # Venda liberada para qualquer cliente da plataforma (sem filtro de área).
    cliente = await VarejistaLeituraRepository(db).get_by_id(cliente_id)
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente nao encontrado")
    return cliente_to_response(cliente)
