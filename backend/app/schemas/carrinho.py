from __future__ import annotations

from datetime import datetime
from typing import Dict, List

from pydantic import BaseModel, Field


class CarrinhoItemBase(BaseModel):
    """Item de carrinho visÃ­vel para o representante.

    Os valores de preÃ§o sempre sÃ£o calculados no backend a partir do
    cadastro de produtos do atacadista, evitando qualquer manipulaÃ§Ã£o
    indevida vinda do frontend.
    """

    produto_id: str = Field(..., description="ID do produto no catÃ¡logo compartilhado")
    descricao_produto: str | None = Field(
        default=None,
        description="DescriÃ§Ã£o do produto para exibiÃ§Ã£o no carrinho",
    )
    atacadista_id: str = Field(..., description="ID do atacadista que vende o produto")
    atacadista_nome: str | None = Field(
        default=None,
        description="Nome/razÃ£o social do atacadista que vende o produto",
    )
    quantidade: int = Field(..., ge=1, description="Quantidade do item")
    unidade_medida: str = Field(
        ...,
        description="Unidade de venda: unidade, caixa ou palete",
    )


class CarrinhoItemRequest(CarrinhoItemBase):
    """Payload para inclusÃ£o/atualizaÃ§Ã£o de item no carrinho.

    O frontend **nÃ£o** envia preÃ§o; apenas produto, atacadista, unidade e
    quantidade. O backend recalcula tudo com seguranÃ§a.
    """

    pass


class CarrinhoItemUpdateRequest(BaseModel):
    """Payload para atualizaÃ§Ã£o de item de carrinho.

    O produto Ã© identificado pela URL (path param) e aqui sÃ³ enviamos os
    campos que podem mudar.
    """

    quantidade: int = Field(..., ge=0, description="Nova quantidade do item")
    unidade_medida: str | None = Field(
        default=None,
        description="Nova unidade de medida (opcional). Se nÃ£o informado, mantÃ©m a atual.",
    )


class CarrinhoItemPreco(BaseModel):
    unidade: str
    preco: float = Field(..., ge=0)
    quantidade_unidades: int = Field(default=1, ge=1)


class CarrinhoItemResponse(CarrinhoItemBase):
    preco_unitario: float = Field(..., ge=0)
    subtotal: float = Field(..., ge=0)
    qtd_minima: int | None = Field(default=None, ge=1)
    qtd_maxima: int | None = Field(default=None, ge=1)
    precos: List[CarrinhoItemPreco] = Field(default_factory=list)


class CarrinhoResponse(BaseModel):
    itens: List[CarrinhoItemResponse] = Field(default_factory=list)
    condicoes_pagamento_por_atacadista: Dict[str, List[str]] = Field(default_factory=dict)
    valor_total: float = Field(..., ge=0)
    atualizado_em: datetime | None = None


class FinalizarCarrinhoEnderecoItem(BaseModel):
    atacadista_id: str = Field(..., description="ID do atacadista")
    endereco_id: str = Field(..., description="ID do endereÃ§o de entrega do representante")
    condicao_pagamento: str | None = Field(
        default=None,
        description="Condicao de pagamento selecionada para o atacadista",
    )
    observacao: str | None = Field(
        default=None,
        description="Observacao opcional do representante para o atacadista",
    )


class FinalizarCarrinhoRequest(BaseModel):
    """Payload para finalizaÃ§Ã£o do carrinho.

    O frontend envia, para cada atacadista presente no carrinho, qual
    endereÃ§o de entrega deve ser utilizado.
    """

    cliente_id: str = Field(..., description="ID do cliente/varejista atendido pelo representante")
    enderecos: List[FinalizarCarrinhoEnderecoItem]


class PedidoGeradoResumo(BaseModel):
    pedido_id: str
    atacadista_id: str
    valor_total: float


class FinalizarCarrinhoResponse(BaseModel):
    pedidos_gerados: List[PedidoGeradoResumo]




