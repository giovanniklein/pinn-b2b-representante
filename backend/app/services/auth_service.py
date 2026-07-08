from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.repositories.base import RepresentanteRepository, RepresentanteUsuarioRepository
from app.schemas.auth import AuthLoginRequest, AuthRegisterRequest, TokenPair, UserResponse
from app.services.cnpj_service import CNPJService


settings = get_settings()


class AuthService:
    """Serviço responsável por autenticação e registro de representantes."""

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.representante_repo = RepresentanteRepository(db)
        self.usuario_repo = RepresentanteUsuarioRepository(db)
        self.cnpj_service = CNPJService()

    async def register_representante(self, payload: AuthRegisterRequest) -> TokenPair:
        """Registra um novo representante + usuário principal e retorna tokens JWT.

        Fluxo:
        - Valida se já existe representante com o CNPJ informado
        - Consulta API pública de CNPJ para preencher dados cadastrais
        - Cria o representante com endereço principal + endereços extras
        - Cria o usuário principal vinculado (tipo_usuario="representante")
        - Retorna par de tokens (access + refresh)
        """

        email_normalizado = payload.email.strip().lower()

        # Garante CNPJ único entre representantes
        existing = await self.representante_repo.find_by_cnpj(payload.cnpj)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe um representante com este CNPJ",
            )

        # Garante e-mail único entre representantes
        existing_representante_email = await self.representante_repo.find_by_email_ci(email_normalizado)
        if existing_representante_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe um representante cadastrado com este e-mail",
            )

        # Garante email único na coleção de usuários
        existing_user = await self.usuario_repo.find_by_email_any_tipo_ci(email_normalizado)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Já existe um usuário cadastrado com este e-mail",
            )

        # Consulta dados do CNPJ
        cnpj_data = await self.cnpj_service.buscar_dados(payload.cnpj)

        # Monta documento do representante
        from datetime import datetime
        from uuid import uuid4

        principal_endereco = {
            "id": str(uuid4()),
            "descricao": "Endereço principal",
            "logradouro": cnpj_data.get("logradouro"),
            "numero": cnpj_data.get("numero"),
            "bairro": cnpj_data.get("bairro"),
            "cidade": cnpj_data.get("cidade"),
            "uf": cnpj_data.get("uf"),
            "cep": cnpj_data.get("cep"),
            "complemento": cnpj_data.get("complemento"),
            "eh_principal": True,
        }

        enderecos_extras = []
        for endereco in payload.enderecos_extras:
            enderecos_extras.append(
                {
                    "id": str(uuid4()),
                    "descricao": endereco.descricao,
                    "logradouro": endereco.logradouro,
                    "numero": endereco.numero,
                    "bairro": endereco.bairro,
                    "cidade": endereco.cidade,
                    "uf": endereco.uf,
                    "cep": endereco.cep,
                    "complemento": endereco.complemento,
                    "eh_principal": False,
                }
            )

        now = datetime.utcnow()

        representante_doc = {
            "cnpj": payload.cnpj,
            "email": email_normalizado,
            "telefone": payload.telefone or cnpj_data.get("telefone"),
            "razao_social": cnpj_data.get("razao_social"),
            "nome_fantasia": cnpj_data.get("nome_fantasia"),
            "estado_atendimento": (payload.estado_atendimento or "").strip().upper() or None,
            "cidades_atendidas": [cidade.strip().upper() for cidade in payload.cidades_atendidas if cidade.strip()],
            "enderecos": [principal_endereco, *enderecos_extras],
            "created_at": now,
            "updated_at": now,
        }

        representante_id = await self.representante_repo.insert(representante_doc)

        # Usuário principal vinculado ao representante
        user_doc = {
            "tipo_usuario": "representante",
            "representante_id": representante_id,
            "nome": cnpj_data.get("nome_fantasia") or cnpj_data.get("razao_social"),
            "email": email_normalizado,
            "telefone": payload.telefone or cnpj_data.get("telefone"),
            "senha_hash": get_password_hash(payload.senha),
            "is_admin": True,
            "created_at": now,
        }

        user_id = await self.usuario_repo.insert(user_doc)

        return await self._generate_tokens(user_id=user_id, representante_id=representante_id)

    async def login(self, payload: AuthLoginRequest) -> TokenPair:
        """Autentica o usuário via e-mail/senha e retorna tokens JWT."""

        user = await self.usuario_repo.find_representante_by_email(payload.identifier.strip().lower())
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas",
            )

        if user.get("tipo_usuario") != "representante":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tipo de usuário inválido para este aplicativo",
            )

        if not verify_password(payload.senha, user.get("senha_hash", "")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas",
            )

        representante_id = str(user["representante_id"])
        user_id = str(user["_id"])

        representante = await self.representante_repo.get_active_by_id(representante_id)
        if not representante:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Representante inativo",
            )

        return await self._generate_tokens(user_id=user_id, representante_id=representante_id)

    async def _generate_tokens(self, user_id: str, representante_id: str) -> TokenPair:
        access_expires = timedelta(minutes=settings.access_token_expire_minutes)
        refresh_expires = timedelta(minutes=settings.refresh_token_expire_minutes)

        access_token = create_access_token(
            subject=user_id,
            representante_id=representante_id,
            expires_delta=access_expires,
        )
        refresh_token = create_refresh_token(
            subject=user_id,
            representante_id=representante_id,
            expires_delta=refresh_expires,
        )

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=int(access_expires.total_seconds()),
        )

    async def build_user_response(self, user_doc: dict) -> UserResponse:
        """Mapeia um documento bruto de usuário para o schema de resposta."""

        return UserResponse(
            id=str(user_doc["_id"]),
            nome=user_doc.get("nome", ""),
            email=user_doc.get("email"),
            representante_id=str(user_doc.get("representante_id")),
        )
