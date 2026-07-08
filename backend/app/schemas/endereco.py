from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class EnderecoBase(BaseModel):
    descricao: str = Field(..., description="Descrição amigável do endereço")
    logradouro: str
    numero: str
    bairro: str
    cidade: str
    uf: str = Field(..., min_length=2, max_length=2)
    cep: str
    complemento: Optional[str] = None
    eh_principal: bool = Field(
        default=False,
        description="Indica se este é o endereço principal do representante",
    )


class EnderecoCreate(EnderecoBase):
    pass


class EnderecoUpdate(BaseModel):
    descricao: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = Field(default=None, min_length=2, max_length=2)
    cep: Optional[str] = None
    complemento: Optional[str] = None


class EnderecoResponse(EnderecoBase):
    id: str


class EnderecoListResponse(BaseModel):
    items: List[EnderecoResponse]


class DefinirPrincipalResponse(BaseModel):
    id: str
    eh_principal: bool
