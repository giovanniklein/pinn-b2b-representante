from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import AliasChoices, BaseModel, EmailStr, Field


class TokenPair(BaseModel):
    """Payload retornado após login, registro ou refresh contendo os tokens JWT."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(
        ..., description="Tempo de expiração do access token em segundos."
    )


class EnderecoInput(BaseModel):
    """Endereço de entrega informado no auto-registro.

    No backend, o endereço principal será criado a partir da API de CNPJ
    e marcado com `eh_principal=True`. Os endereços extras enviados aqui
    serão adicionados como complementares.
    """

    descricao: str = Field(..., description="Descrição amigável do endereço")
    logradouro: str
    numero: str
    bairro: str
    cidade: str
    uf: str = Field(..., min_length=2, max_length=2)
    cep: str
    complemento: Optional[str] = None


class AuthRegisterRequest(BaseModel):
    """Payload de registro de um novo representante + usuário principal.

    Fluxo esperado:
    - Usuário informa CNPJ, email, telefone, senha e endereços extras
    - Backend consulta https://publica.cnpj.ws/cnpj/{cnpj}
    - Cria representante + usuário + endereço principal + extras
    - Retorna par de tokens (access + refresh)
    """

    cnpj: str
    email: EmailStr
    telefone: Optional[str] = None
    senha: str

    enderecos_extras: list[EnderecoInput] = Field(
        default_factory=list,
        description="Lista de endereços extras além do principal descoberto pelo CNPJ.",
    )


class AuthLoginRequest(BaseModel):
    """Payload de login do usuário do representante.

    Aceita `login` ou `email` para manter compatibilidade com o padrão
    adotado no app do atacadista.
    """

    login: str = Field(
        ...,
        description="Email do usuário do representante",
        validation_alias=AliasChoices("login", "email"),
    )
    senha: str

    @property
    def identifier(self) -> str:
        return self.login


class AuthRefreshRequest(BaseModel):
    """Payload para solicitar novo par de tokens a partir do refresh token."""

    refresh_token: str


class UserResponse(BaseModel):
    """Usuário logado retornado pelo /auth/me."""

    id: str
    nome: str
    email: EmailStr
    representante_id: str
    created_at: Optional[datetime] = None


class MeResponse(BaseModel):
    """Informações consolidadas do usuário + representante logado."""

    user: UserResponse
    representante_razao_social: Optional[str] = None
    representante_nome_fantasia: Optional[str] = None
    representante_cnpj: Optional[str] = None
    representante_id: str
