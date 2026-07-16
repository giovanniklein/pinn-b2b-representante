from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, Field

from app.models.common import PedidoStatus


class PedidoEnderecoResponse(BaseModel):
    """Endereco de entrega associado a um pedido."""

    id: str = Field(..., description="ID interno do endereco no cadastro do representante")
    descricao: str
    logradouro: str
    numero: str
    bairro: str
    cidade: str
    uf: str
    cep: str
    complemento: str | None = None
    eh_principal: bool


class PedidoItemResponse(BaseModel):
    produto_id: str
    codigo: str | None = Field(default=None, description="Código do produto no catálogo do fornecedor")
    descricao_produto: str
    unidade: str
    quantidade_unidades: int = Field(default=1, ge=1)
    quantidade: int = Field(..., ge=1)
    valor_unitario: float = Field(..., ge=0)
    valor_total: float = Field(..., ge=0)


class PedidoListItem(BaseModel):
    id: str
    origem_venda: str | None = Field(default=None)
    atacadista_id: str
    atacadista_nome: str | None = Field(
        default=None,
        description="Nome/razao social do atacadista para exibicao na lista de pedidos",
    )
    condicao_pagamento: str = Field(default="A VISTA")
    cliente_id: str | None = Field(default=None)
    cliente_nome: str | None = Field(default=None)
    cliente_cnpj: str | None = Field(default=None)
    observacao_representante: str | None = Field(default=None)
    senha_compra: str | None = Field(default=None, description="Palavra-chave da compra, se gerada")
    valor_total: float
    comissao_representante_valor: float | None = Field(default=None)
    comissao_kipi_valor: float | None = Field(default=None)
    comissao_status: str | None = Field(default=None)
    status: PedidoStatus
    data_criacao: datetime
    endereco_entrega: PedidoEnderecoResponse


class PedidoListResponse(BaseModel):
    items: List[PedidoListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class PedidoDetailResponse(BaseModel):
    id: str
    origem_venda: str | None = Field(default=None)
    atacadista_id: str
    atacadista_nome: str | None = Field(
        default=None,
        description="Nome/razao social do atacadista para exibicao no detalhe do pedido",
    )
    atacadista_cnpj: str | None = Field(default=None)
    atacadista_email: str | None = Field(default=None)
    atacadista_telefone: str | None = Field(default=None)
    representante_nome: str | None = Field(default=None)
    condicao_pagamento: str = Field(default="A VISTA")
    observacao_representante: str | None = Field(default=None)
    cliente_id: str | None = Field(default=None)
    cliente_nome: str | None = Field(default=None)
    cliente_razao_social: str | None = Field(default=None)
    cliente_inscricao_estadual: str | None = Field(default=None)
    cliente_cnpj: str | None = Field(default=None)
    cliente_email: str | None = Field(default=None)
    cliente_email_notas: str | None = Field(default=None)
    cliente_nome_contato: str | None = Field(default=None)
    cliente_telefone: str | None = Field(default=None)
    cliente_celular: str | None = Field(default=None)
    cliente_endereco: str | None = Field(default=None, description="Endereço cadastral do cliente, formatado")
    senha_compra: str | None = Field(default=None, description="Palavra-chave da compra, se gerada")
    representante_id: str
    valor_total: float
    comissao_total_percentual: float | None = Field(default=None)
    comissao_representante_percentual: float | None = Field(default=None)
    comissao_kipi_percentual: float | None = Field(default=None)
    comissao_total_valor: float | None = Field(default=None)
    comissao_representante_valor: float | None = Field(default=None)
    comissao_kipi_valor: float | None = Field(default=None)
    comissao_status: str | None = Field(default=None)
    status: PedidoStatus
    data_criacao: datetime
    endereco_entrega: PedidoEnderecoResponse
    itens: List[PedidoItemResponse]
