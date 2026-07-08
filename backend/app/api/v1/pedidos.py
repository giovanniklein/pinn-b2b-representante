from __future__ import annotations

from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.models.common import PedidoStatus
from app.repositories.base import AtacadistaLeituraRepository
from app.schemas.pedido import (
    PedidoDetailResponse,
    PedidoEnderecoResponse,
    PedidoItemResponse,
    PedidoListItem,
    PedidoListResponse,
)
from app.services.carrinho_service import CarrinhoService
from app.utils.dependencies import get_current_representante_id


router = APIRouter()


DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteIdDep = Annotated[str, Depends(get_current_representante_id)]


@router.get("", response_model=PedidoListResponse)
@router.get("/", response_model=PedidoListResponse)
async def listar_pedidos(
    db: DbDep,
    representante_id: RepresentanteIdDep,
    page: int = Query(
        default=1,
        ge=1,
        description="Número da página (para paginação)",
    ),
    page_size: int = Query(
        default=10,
        ge=1,
        le=100,
        description="Quantidade de itens por página (para paginação)",
    ),
) -> PedidoListResponse:
    """Lista pedidos do representante logado, enriquecendo com nome do atacadista.

    Os documentos são lidos da coleção compartilhada `pedidos`.
    """

    service = CarrinhoService(db)
    docs, total = await service.listar_pedidos_representante(
        representante_id,
        page=page,
        page_size=page_size,
    )

    # Carrega nomes dos atacadistas em lote para evitar N+1
    atacadista_repo = AtacadistaLeituraRepository(db)
    atacadista_ids = {
        str(doc.get("atacadista_id"))
        for doc in docs
        if doc.get("atacadista_id") is not None
    }
    atacadistas = await atacadista_repo.get_by_ids(list(atacadista_ids))
    atacadista_por_id = {str(a["_id"]): a for a in atacadistas}

    items: List[PedidoListItem] = []
    for doc in docs:
        endereco_doc = doc.get("endereco_entrega") or {}
        endereco = PedidoEnderecoResponse(**endereco_doc)

        atacadista_id = str(doc.get("atacadista_id")) if doc.get("atacadista_id") else ""
        atacadista_doc = atacadista_por_id.get(atacadista_id)
        atacadista_nome = None
        if atacadista_doc:
            atacadista_nome = (
                atacadista_doc.get("nome_fantasia")
                or atacadista_doc.get("razao_social")
                or atacadista_doc.get("nome")
            )

        items.append(
            PedidoListItem(
                id=str(doc.get("_id")),
                origem_venda=doc.get("origem_venda"),
                atacadista_id=atacadista_id,
                atacadista_nome=atacadista_nome,
                condicao_pagamento=str(doc.get("condicao_pagamento", "A VISTA")),
                cliente_id=doc.get("cliente_id"),
                cliente_nome=doc.get("cliente_nome"),
                cliente_cnpj=doc.get("cliente_cnpj"),
                observacao_representante=doc.get("observacao_representante"),
                senha_compra=doc.get("senha_compra"),
                valor_total=float(doc.get("valor_total", 0.0)),
                comissao_representante_valor=doc.get("comissao_representante_valor"),
                comissao_kipi_valor=doc.get("comissao_kipi_valor"),
                comissao_status=doc.get("comissao_status"),
                status=PedidoStatus(doc.get("status", PedidoStatus.PENDENTE)),
                data_criacao=doc.get("data_criacao"),
                endereco_entrega=endereco,
            )
        )

    total_pages = max((total + page_size - 1) // page_size, 1) if total > 0 else 1

    return PedidoListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{pedido_id}", response_model=PedidoDetailResponse)
async def obter_pedido(
    pedido_id: str,
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> PedidoDetailResponse:
    """Obtém o detalhe de um pedido do representante, com nome do atacadista."""

    service = CarrinhoService(db)
    doc = await service.obter_pedido_representante(representante_id, pedido_id)

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido não encontrado",
        )

    endereco_doc = doc.get("endereco_entrega") or {}
    endereco = PedidoEnderecoResponse(**endereco_doc)

    # Carrega nome do atacadista para enriquecer a resposta de detalhe
    atacadista_repo = AtacadistaLeituraRepository(db)
    atacadista_id = str(doc.get("atacadista_id")) if doc.get("atacadista_id") else ""
    atacadista_nome = None
    if atacadista_id:
        atacadista_doc = await atacadista_repo.get_by_id(atacadista_id)
        if atacadista_doc:
            atacadista_nome = (
                atacadista_doc.get("nome_fantasia")
                or atacadista_doc.get("razao_social")
                or atacadista_doc.get("nome")
            )

    itens: List[PedidoItemResponse] = []
    for item in doc.get("itens", []):
        itens.append(
            PedidoItemResponse(
                produto_id=str(item.get("produto_id")),
                descricao_produto=item.get("descricao_produto", ""),
                unidade=item.get("unidade"),
                quantidade_unidades=int(item.get("quantidade_unidades", 1) or 1),
                quantidade=int(item.get("quantidade", 0)),
                valor_unitario=float(item.get("valor_unitario", 0.0)),
                valor_total=float(item.get("valor_total", 0.0)),
            )
        )

    return PedidoDetailResponse(
        id=str(doc.get("_id")),
        origem_venda=doc.get("origem_venda"),
        atacadista_id=atacadista_id,
        atacadista_nome=atacadista_nome,
        condicao_pagamento=str(doc.get("condicao_pagamento", "A VISTA")),
        observacao_representante=doc.get("observacao_representante"),
        cliente_id=doc.get("cliente_id"),
        cliente_nome=doc.get("cliente_nome"),
        cliente_cnpj=doc.get("cliente_cnpj"),
        senha_compra=doc.get("senha_compra"),
        representante_id=str(doc.get("representante_id")),
        valor_total=float(doc.get("valor_total", 0.0)),
        comissao_total_percentual=doc.get("comissao_total_percentual"),
        comissao_representante_percentual=doc.get("comissao_representante_percentual"),
        comissao_kipi_percentual=doc.get("comissao_kipi_percentual"),
        comissao_total_valor=doc.get("comissao_total_valor"),
        comissao_representante_valor=doc.get("comissao_representante_valor"),
        comissao_kipi_valor=doc.get("comissao_kipi_valor"),
        comissao_status=doc.get("comissao_status"),
        status=PedidoStatus(doc.get("status", PedidoStatus.PENDENTE)),
        data_criacao=doc.get("data_criacao"),
        endereco_entrega=endereco,
        itens=itens,
    )


@router.post("/{pedido_id}/duplicar", response_model=dict)
async def duplicar_pedido(
    pedido_id: str,
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> dict:
    """Duplica um pedido antigo e adiciona os itens ao carrinho atual."""

    service = CarrinhoService(db)
    carrinho = await service.duplicar_pedido(representante_id, pedido_id)
    return {"message": "Pedido duplicado no carrinho", "carrinho": carrinho}
