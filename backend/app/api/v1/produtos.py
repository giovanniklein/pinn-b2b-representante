from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.schemas.produto import ProdutoListResponse, ProdutoResponse
from app.services.produto_service import ProdutoLeituraService
from app.utils.dependencies import get_current_representante_id


router = APIRouter()


DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteDep = Annotated[str, Depends(get_current_representante_id)]


@router.get('/parceiros')
async def listar_parceiros(db: DbDep, representante_id: RepresentanteDep) -> list[dict]:
    """Lista os parceiros (atacadistas) que atendem a cidade do cliente.

    Usado no seletor da vitrine para o cliente montar um pedido de um único
    fornecedor.
    """

    service = ProdutoLeituraService(db)
    return await service.listar_parceiros_visiveis(representante_id)


@router.get('/', response_model=ProdutoListResponse)
async def listar_produtos(
    db: DbDep,
    representante_id: RepresentanteDep,
    page: int = Query(default=1, ge=1, description='Numero da pagina'),
    page_size: int = Query(default=20, ge=1, le=100, description='Quantidade de itens por pagina'),
    q: str | None = Query(default=None, description='Busca parcial por descricao do produto'),
    atacadista_id: str | None = Query(default=None, description='Filtra produtos de um atacadista especifico'),
) -> ProdutoListResponse:
    """Lista produtos para o representante (apenas de parceiros que atendem a cidade dele)."""

    service = ProdutoLeituraService(db)
    return await service.listar_produtos(
        page=page,
        page_size=page_size,
        query=q,
        atacadista_id=atacadista_id,
        representante_id=representante_id,
    )


@router.get('/{produto_id}', response_model=ProdutoResponse)
async def obter_produto(
    produto_id: str,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ProdutoResponse:
    """Obtem os detalhes de um unico produto."""

    service = ProdutoLeituraService(db)
    produto = await service.obter_produto(produto_id, representante_id=representante_id)
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Produto nao encontrado',
        )
    return produto
