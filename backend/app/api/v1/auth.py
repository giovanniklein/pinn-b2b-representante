from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.security import decode_token
from app.repositories.base import RepresentanteRepository
from app.schemas.auth import (
    AuthLoginRequest,
    AuthRefreshRequest,
    AuthRegisterRequest,
    MeResponse,
    TokenPair,
    UserResponse,
)
from app.services.auth_service import AuthService
from app.utils.dependencies import CurrentUser, get_current_user


router = APIRouter()


DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register_representante(payload: AuthRegisterRequest, db: DbDep) -> TokenPair:
    """Registra um novo representante + usuário principal.

    Fluxo:
    - Valida se já existe representante com o CNPJ informado
    - Consulta API pública de CNPJ
    - Cria o representante com endereço principal + endereços extras
    - Cria o usuário principal vinculado (tipo_usuario="representante")
    - Retorna par de tokens (access + refresh)
    """

    service = AuthService(db)
    return await service.register_representante(payload)


@router.post("/login", response_model=TokenPair)
async def login(payload: AuthLoginRequest, db: DbDep) -> TokenPair:
    """Autentica o usuário do representante via e-mail e senha."""

    service = AuthService(db)
    return await service.login(payload)


@router.get("/me", response_model=MeResponse)
async def get_me(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: DbDep,
) -> MeResponse:
    """Retorna informações do usuário logado e do representante vinculado.

    O `representante_id` é sempre obtido do JWT via `get_current_user`.
    """

    representante_repo = RepresentanteRepository(db)
    representante = await representante_repo.get_by_id(current_user.representante_id)
    if not representante:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Representante não encontrado",
        )

    user_response = UserResponse(
        id=current_user.id,
        nome=current_user.nome,
        email=current_user.email,
        representante_id=current_user.representante_id,
    )

    return MeResponse(
        user=user_response,
        representante_razao_social=representante.get("razao_social"),
        representante_nome_fantasia=representante.get("nome_fantasia"),
        representante_cnpj=representante.get("cnpj"),
        representante_id=str(representante["_id"]),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(payload: AuthRefreshRequest, db: DbDep) -> TokenPair:
    """Gera um novo par de tokens (access + refresh) a partir de um refresh token válido.

    Regras:
    - O token deve ser do tipo `refresh`
    - O payload deve conter `sub` (id do usuário) e `representante_id`
    - Expiração do token é validada automaticamente pelo decode
    """

    try:
        decoded = decode_token(payload.refresh_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado",
        ) from exc

    if decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token informado não é um refresh token",
        )

    if decoded.get("tipo_usuario") != "representante":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de usuário inválido para este aplicativo",
        )

    user_id: str | None = decoded.get("sub")
    representante_id: str | None = decoded.get("representante_id")

    if not user_id or not representante_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido",
        )

    representante_repo = RepresentanteRepository(db)
    representante = await representante_repo.get_active_by_id(representante_id)
    if not representante:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Representante inativo",
        )

    service = AuthService(db)
    return await service._generate_tokens(  # type: ignore[attr-defined]
        user_id=user_id,
        representante_id=representante_id,
    )
