from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class UnidadeTipo(str, Enum):
    """Tipo de unidade comercializada pelos atacadistas.

    O representante apenas consome estes tipos ao montar o carrinho.
    """

    UNIDADE = "unidade"
    CAIXA = "caixa"
    PALETE = "palete"


class PedidoStatus(str, Enum):
    """Status possível de um pedido.

    Compartilhado com o app do atacadista, pois os pedidos ficam na
    mesma coleção MongoDB (`pedidos`).
    """

    PENDENTE = "pendente"
    ACEITO = "aceito"
    RECUSADO = "recusado"
    ENTREGUE = "entregue"


class MongoModel(BaseModel):
    """Base para modelos persistidos no MongoDB.

    Usamos `id` como campo de alto nível e mapeamos para `_id` no Mongo.
    """

    id: Optional[str] = Field(default=None, alias="_id")

    class Config:
        allow_population_by_field_name = True
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {datetime: lambda v: v.isoformat()}
