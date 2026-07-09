from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Parceiro (atacadista) — cadastro/manutenção pelo representante
# ---------------------------------------------------------------------------

class ParceiroCreateRequest(BaseModel):
    """Cadastro de um novo parceiro (atacadista), idêntico ao auto-registro."""

    nome_fantasia: str = Field(..., min_length=1)
    cnpj: str = Field(..., min_length=1)
    email: EmailStr
    telefone: Optional[str] = None
    senha: str = Field(..., min_length=4)

    pedido_minimo: Optional[float] = Field(default=None, ge=0.0)
    estado_atendimento: Optional[str] = Field(default=None, max_length=2)
    cidades_atendidas: List[str] = Field(default_factory=list)
    participa_venda_mais: bool = Field(default=False)


class ParceiroUpdateRequest(BaseModel):
    """Atualização de um parceiro criado pelo representante."""

    nome_fantasia: Optional[str] = Field(default=None, min_length=1)
    telefone: Optional[str] = None
    pedido_minimo: Optional[float] = Field(default=None, ge=0.0)
    estado_atendimento: Optional[str] = Field(default=None, max_length=2)
    cidades_atendidas: Optional[List[str]] = None
    participa_venda_mais: Optional[bool] = None
    vendas_pausadas: Optional[bool] = None


class ParceiroResponse(BaseModel):
    id: str
    nome_fantasia: Optional[str] = None
    razao_social: Optional[str] = None
    cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    pedido_minimo: Optional[float] = None
    estado_atendimento: Optional[str] = None
    cidades_atendidas: List[str] = Field(default_factory=list)
    participa_venda_mais: bool = False
    vendas_pausadas: bool = False
    ativo: bool = True


class ParceiroListResponse(BaseModel):
    items: List[ParceiroResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


def parceiro_to_response(doc: dict[str, Any]) -> ParceiroResponse:
    return ParceiroResponse(
        id=str(doc.get("_id")),
        nome_fantasia=doc.get("nome_fantasia"),
        razao_social=doc.get("razao_social"),
        cnpj=doc.get("cnpj"),
        email=doc.get("email"),
        telefone=doc.get("telefone"),
        pedido_minimo=doc.get("pedido_minimo"),
        estado_atendimento=doc.get("estado_atendimento") or doc.get("uf") or doc.get("estado"),
        cidades_atendidas=doc.get("cidades_atendidas") or [],
        participa_venda_mais=bool(doc.get("participa_venda_mais")),
        vendas_pausadas=bool(doc.get("vendas_pausadas")),
        ativo=doc.get("ativo", True) is not False,
    )


# ---------------------------------------------------------------------------
# Cliente (varejista) — cadastro/manutenção pelo representante
# ---------------------------------------------------------------------------

class ClienteEnderecoInput(BaseModel):
    descricao: str = Field(default="Endereço")
    logradouro: str = ""
    numero: str = ""
    bairro: str = ""
    cidade: str = ""
    uf: str = Field(default="", max_length=2)
    cep: str = ""
    complemento: Optional[str] = None


class ClienteCreateRequest(BaseModel):
    """Cadastro de um novo cliente (varejista).

    Segue o mesmo espírito do auto-registro do varejista (enriquece via CNPJ),
    mas aceita os campos principais manualmente como fallback caso a API pública
    de CNPJ não retorne dados.
    """

    cnpj: str = Field(..., min_length=1)
    email: EmailStr
    telefone: Optional[str] = None
    senha: str = Field(..., min_length=4)

    # Fallback manual (usado quando a API de CNPJ não responde)
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = Field(default=None, max_length=2)

    enderecos_extras: List[ClienteEnderecoInput] = Field(default_factory=list)


class ClienteUpdateRequest(BaseModel):
    nome_fantasia: Optional[str] = None
    razao_social: Optional[str] = None
    telefone: Optional[str] = None
    enderecos: Optional[List[ClienteEnderecoInput]] = None
