from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase


logger = logging.getLogger(__name__)


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Cria indices essenciais para estabilidade/performance.

    - carrinhos.representante_id unico: evita mais de um carrinho por representante
    - atacadistas.ativo: acelera filtros de ativos
    - produtos.atacadista_id+_id: leitura de catalogo e carrinho
    """

    await db["carrinhos"].create_index(
        [("representante_id", 1)],
        unique=True,
        name="uniq_carrinhos_representante_id",
    )
    await db["atacadistas"].create_index(
        [("ativo", 1)],
        name="idx_atacadistas_ativo",
    )
    await db["produtos"].create_index(
        [("atacadista_id", 1), ("_id", -1)],
        name="idx_produtos_atacadista_id__id_desc",
    )
    await db["produtos"].create_index(
        [("descricao_normalizada", 1)],
        name="idx_produtos_descricao_normalizada",
    )
    logger.info("[startup] Indices essenciais garantidos.")
