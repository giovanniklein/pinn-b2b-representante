from __future__ import annotations

from datetime import datetime
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.security import get_password_hash
from app.repositories.base import (
    AtacadistaLeituraRepository,
    RepresentanteRepository,
    RepresentanteUsuarioRepository,
)
from app.schemas.gestao import (
    ParceiroCreateRequest,
    ParceiroListResponse,
    ParceiroResponse,
    ParceiroUpdateRequest,
    parceiro_to_response,
)
from app.utils.dependencies import get_current_representante_id


router = APIRouter()

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteDep = Annotated[str, Depends(get_current_representante_id)]


async def _assert_representante_ativo(db: AsyncIOMotorDatabase, representante_id: str) -> None:
    representante = await RepresentanteRepository(db).get_active_by_id(representante_id)
    if not representante:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Representante inativo")


@router.post("", response_model=ParceiroResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ParceiroResponse, status_code=status.HTTP_201_CREATED)
async def criar_parceiro(
    payload: ParceiroCreateRequest,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ParceiroResponse:
    await _assert_representante_ativo(db, representante_id)

    atacadista_repo = AtacadistaLeituraRepository(db)
    usuario_repo = RepresentanteUsuarioRepository(db)

    email = str(payload.email).strip().lower()

    # Deduplicação: CNPJ e e-mail (parceiro já existe na plataforma)
    if await atacadista_repo.find_by_cnpj(payload.cnpj):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um parceiro com este CNPJ")
    if await atacadista_repo.find_by_email_ci(email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um parceiro com este e-mail")
    if await usuario_repo.find_by_email_any_tipo_ci(email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um usuário com este e-mail")

    now = datetime.utcnow()
    atacadista_doc = {
        "nome_fantasia": payload.nome_fantasia.strip(),
        "cnpj": payload.cnpj.strip(),
        "email": email,
        "telefone": payload.telefone,
        "ativo": True,
        "pedido_minimo": float(payload.pedido_minimo) if payload.pedido_minimo is not None else 200.0,
        "estado_atendimento": (payload.estado_atendimento or "").upper() or None,
        "cidades_atendidas": [c.strip() for c in payload.cidades_atendidas if c and c.strip()],
        "participa_venda_mais": bool(payload.participa_venda_mais),
        "condicoes_pagamento": ["A VISTA"],
        # Vínculo com o representante que cadastrou (para manutenção).
        "criado_por_representante_id": representante_id,
        "created_at": now,
        "updated_at": now,
    }
    atacadista_id = await atacadista_repo.insert(atacadista_doc)

    # Usuário de acesso do parceiro (login em parceiros.kipi.com.br)
    await usuario_repo.insert(
        {
            "atacadista_id": atacadista_id,
            "nome": payload.nome_fantasia.strip(),
            "email": email,
            "senha_hash": get_password_hash(payload.senha),
            "is_admin": True,
            "created_at": now,
        }
    )

    atacadista_doc["_id"] = atacadista_id
    return parceiro_to_response(atacadista_doc)


@router.get("", response_model=ParceiroListResponse)
@router.get("/", response_model=ParceiroListResponse)
async def listar_meus_parceiros(
    db: DbDep,
    representante_id: RepresentanteDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None),
) -> ParceiroListResponse:
    await _assert_representante_ativo(db, representante_id)

    docs = await AtacadistaLeituraRepository(db).listar_criados_por_representante(
        representante_id, q=q
    )
    total = len(docs)
    skip = (page - 1) * page_size
    items = [parceiro_to_response(doc) for doc in docs[skip : skip + page_size]]
    total_pages = ceil(total / page_size) if total > 0 else 1
    return ParceiroListResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages
    )


async def _get_meu_parceiro_ou_404(
    db: AsyncIOMotorDatabase, representante_id: str, parceiro_id: str
) -> dict:
    doc = await AtacadistaLeituraRepository(db).get_raw_by_id(parceiro_id)
    if not doc or doc.get("criado_por_representante_id") != representante_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parceiro não encontrado")
    return doc


@router.get("/{parceiro_id}", response_model=ParceiroResponse)
async def obter_meu_parceiro(
    parceiro_id: str,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ParceiroResponse:
    await _assert_representante_ativo(db, representante_id)
    doc = await _get_meu_parceiro_ou_404(db, representante_id, parceiro_id)
    return parceiro_to_response(doc)


@router.put("/{parceiro_id}", response_model=ParceiroResponse)
async def atualizar_meu_parceiro(
    parceiro_id: str,
    payload: ParceiroUpdateRequest,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ParceiroResponse:
    await _assert_representante_ativo(db, representante_id)
    await _get_meu_parceiro_ou_404(db, representante_id, parceiro_id)

    updates: dict = {}
    if payload.nome_fantasia is not None:
        updates["nome_fantasia"] = payload.nome_fantasia.strip()
    if payload.telefone is not None:
        updates["telefone"] = payload.telefone
    if payload.pedido_minimo is not None:
        updates["pedido_minimo"] = float(payload.pedido_minimo)
    if payload.estado_atendimento is not None:
        updates["estado_atendimento"] = (payload.estado_atendimento or "").upper() or None
    if payload.cidades_atendidas is not None:
        updates["cidades_atendidas"] = [c.strip() for c in payload.cidades_atendidas if c and c.strip()]
    if payload.participa_venda_mais is not None:
        updates["participa_venda_mais"] = bool(payload.participa_venda_mais)
    if payload.vendas_pausadas is not None:
        updates["vendas_pausadas"] = bool(payload.vendas_pausadas)

    if updates:
        updates["updated_at"] = datetime.utcnow()
        await AtacadistaLeituraRepository(db).update_fields(parceiro_id, updates)

    doc = await _get_meu_parceiro_ou_404(db, representante_id, parceiro_id)
    return parceiro_to_response(doc)
