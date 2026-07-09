from __future__ import annotations

from datetime import datetime
from math import ceil
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.security import get_password_hash
from app.repositories.base import (
    RepresentanteRepository,
    VarejistaLeituraRepository,
)
from app.schemas.cliente import ClienteListItem, ClienteListResponse, cliente_to_response
from app.schemas.gestao import ClienteCreateRequest, ClienteUpdateRequest
from app.services.cnpj_service import CNPJService
from app.utils.dependencies import get_current_representante_id


router = APIRouter()

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteDep = Annotated[str, Depends(get_current_representante_id)]


def _nome_representante(doc: dict) -> str | None:
    return doc.get("nome_fantasia") or doc.get("razao_social") or doc.get("nome")


async def _get_representante_ativo(db: AsyncIOMotorDatabase, representante_id: str) -> dict:
    representante = await RepresentanteRepository(db).get_active_by_id(representante_id)
    if not representante:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Representante inativo")
    return representante


@router.post("", response_model=ClienteListItem, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ClienteListItem, status_code=status.HTTP_201_CREATED)
async def criar_cliente(
    payload: ClienteCreateRequest,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ClienteListItem:
    representante = await _get_representante_ativo(db, representante_id)

    varejista_repo = VarejistaLeituraRepository(db)

    email = str(payload.email).strip().lower()

    # Deduplicação: só bloqueia se JÁ EXISTE um cliente ATIVO com este CNPJ/e-mail.
    # Vários representantes podem ter PRÉ-CADASTRO do mesmo CNPJ (todos aceitos);
    # o vínculo ativo será de quem primeiro vender e entregar pelo VendeMais.
    if await varejista_repo.find_ativo_by_cnpj(payload.cnpj):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um cliente ativo com este CNPJ")
    if await varejista_repo.find_ativo_by_email_ci(email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um cliente ativo com este e-mail")

    # Enriquecimento best-effort via CNPJ (não bloqueia o cadastro se falhar)
    cnpj_data = await CNPJService().buscar_dados_opcional(payload.cnpj) or {}

    razao_social = payload.razao_social or cnpj_data.get("razao_social")
    nome_fantasia = payload.nome_fantasia or cnpj_data.get("nome_fantasia") or razao_social

    principal = {
        "id": str(uuid4()),
        "descricao": "Endereço principal",
        "logradouro": cnpj_data.get("logradouro") or "",
        "numero": cnpj_data.get("numero") or "",
        "bairro": cnpj_data.get("bairro") or "",
        "cidade": payload.cidade or cnpj_data.get("cidade") or "",
        "uf": (payload.uf or cnpj_data.get("uf") or "").upper(),
        "cep": cnpj_data.get("cep") or "",
        "complemento": cnpj_data.get("complemento"),
        "eh_principal": True,
    }
    extras = [
        {
            "id": str(uuid4()),
            "descricao": e.descricao,
            "logradouro": e.logradouro,
            "numero": e.numero,
            "bairro": e.bairro,
            "cidade": e.cidade,
            "uf": (e.uf or "").upper(),
            "cep": e.cep,
            "complemento": e.complemento,
            "eh_principal": False,
        }
        for e in payload.enderecos_extras
    ]

    now = datetime.utcnow()
    # PRÉ-CADASTRO: cliente ainda não pode comprar sozinho (sem login). Só é
    # ativado quando a 1ª venda VendeMais deste representante for ENTREGUE.
    varejista_doc = {
        "cnpj": payload.cnpj.strip(),
        "email": email,
        "telefone": payload.telefone or cnpj_data.get("telefone"),
        "razao_social": razao_social,
        "nome_fantasia": nome_fantasia,
        "enderecos": [principal, *extras],
        "ativo": False,
        "status_cadastro": "pre_cadastro",
        # Senha definida pelo rep, usada para criar o login quando ativar.
        "senha_hash_pendente": get_password_hash(payload.senha),
        "criado_por_representante_id": representante_id,
        "criado_por_representante_nome": _nome_representante(representante),
        "created_at": now,
        "updated_at": now,
    }
    varejista_id = await varejista_repo.insert(varejista_doc)

    varejista_doc["_id"] = varejista_id
    return cliente_to_response(varejista_doc)


@router.get("", response_model=ClienteListResponse)
@router.get("/", response_model=ClienteListResponse)
async def listar_meus_clientes(
    db: DbDep,
    representante_id: RepresentanteDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None),
) -> ClienteListResponse:
    await _get_representante_ativo(db, representante_id)

    docs = await VarejistaLeituraRepository(db).listar_criados_por_representante(
        representante_id, q=q
    )
    total = len(docs)
    skip = (page - 1) * page_size
    items = [cliente_to_response(doc) for doc in docs[skip : skip + page_size]]
    total_pages = ceil(total / page_size) if total > 0 else 1
    return ClienteListResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages
    )


async def _get_meu_cliente_ou_404(
    db: AsyncIOMotorDatabase, representante_id: str, cliente_id: str
) -> dict:
    doc = await VarejistaLeituraRepository(db).get_raw_by_id(cliente_id)
    if not doc or doc.get("criado_por_representante_id") != representante_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    return doc


@router.get("/{cliente_id}", response_model=ClienteListItem)
async def obter_meu_cliente(
    cliente_id: str,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ClienteListItem:
    await _get_representante_ativo(db, representante_id)
    doc = await _get_meu_cliente_ou_404(db, representante_id, cliente_id)
    return cliente_to_response(doc)


@router.put("/{cliente_id}", response_model=ClienteListItem)
async def atualizar_meu_cliente(
    cliente_id: str,
    payload: ClienteUpdateRequest,
    db: DbDep,
    representante_id: RepresentanteDep,
) -> ClienteListItem:
    await _get_representante_ativo(db, representante_id)
    await _get_meu_cliente_ou_404(db, representante_id, cliente_id)

    updates: dict = {}
    if payload.nome_fantasia is not None:
        updates["nome_fantasia"] = payload.nome_fantasia
    if payload.razao_social is not None:
        updates["razao_social"] = payload.razao_social
    if payload.telefone is not None:
        updates["telefone"] = payload.telefone
    if payload.enderecos is not None:
        updates["enderecos"] = [
            {
                "id": str(uuid4()),
                "descricao": e.descricao,
                "logradouro": e.logradouro,
                "numero": e.numero,
                "bairro": e.bairro,
                "cidade": e.cidade,
                "uf": (e.uf or "").upper(),
                "cep": e.cep,
                "complemento": e.complemento,
                "eh_principal": index == 0,
            }
            for index, e in enumerate(payload.enderecos)
        ]

    if updates:
        updates["updated_at"] = datetime.utcnow()
        await VarejistaLeituraRepository(db).update_fields(cliente_id, updates)

    doc = await _get_meu_cliente_ou_404(db, representante_id, cliente_id)
    return cliente_to_response(doc)
