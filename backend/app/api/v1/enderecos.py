from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.schemas.endereco import (
    DefinirPrincipalResponse,
    EnderecoCreate,
    EnderecoListResponse,
    EnderecoResponse,
    EnderecoUpdate,
)
from app.services.endereco_service import EnderecoService
from app.utils.dependencies import get_current_representante_id


router = APIRouter()


DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteIdDep = Annotated[str, Depends(get_current_representante_id)]


@router.get("", response_model=EnderecoListResponse)
@router.get("/", response_model=EnderecoListResponse)
async def listar_enderecos(
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> EnderecoListResponse:
    service = EnderecoService(db)
    return await service.listar_enderecos(representante_id)


@router.post("", response_model=EnderecoResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=EnderecoResponse, status_code=status.HTTP_201_CREATED)
async def criar_endereco(
    payload: EnderecoCreate,
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> EnderecoResponse:
    service = EnderecoService(db)
    return await service.criar_endereco(representante_id, payload)


@router.put("/{endereco_id}", response_model=EnderecoResponse)
async def atualizar_endereco(
    endereco_id: str,
    payload: EnderecoUpdate,
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> EnderecoResponse:
    service = EnderecoService(db)
    return await service.atualizar_endereco(representante_id, endereco_id, payload)


@router.delete("/{endereco_id}")
async def deletar_endereco(
    endereco_id: str,
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> None:
    service = EnderecoService(db)
    await service.deletar_endereco(representante_id, endereco_id)


@router.post("/{endereco_id}/definir-principal", response_model=DefinirPrincipalResponse)
async def definir_principal(
    endereco_id: str,
    db: DbDep,
    representante_id: RepresentanteIdDep,
) -> DefinirPrincipalResponse:
    service = EnderecoService(db)
    return await service.definir_principal(representante_id, endereco_id)
