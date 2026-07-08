from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, carrinho, clientes, configuracoes, enderecos, pedidos, produtos
from app.core.config import get_settings
from app.core.database import close_client, get_client
from app.core.indexes import ensure_indexes
from app.seed.initial_data import seed_initial_data


logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle.

    - create Mongo client early
    - ensure required indexes
    - run idempotent seeds
    - close Mongo client on shutdown
    """

    client = await get_client()
    db = client[settings.mongodb_database]

    try:
        await ensure_indexes(db)
    except Exception:  # noqa: BLE001
        logger.exception("[startup] Failed to create indexes.")

    logger.info("[startup] Running representante seeds...")
    try:
        await seed_initial_data()
        logger.info("[startup] Seeds completed.")
    except Exception:  # noqa: BLE001
        logger.exception("[startup] Failed to run seeds.")

    yield

    await close_client()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(enderecos.router, prefix="/enderecos", tags=["enderecos"])
app.include_router(clientes.router, prefix="/clientes", tags=["clientes"])
app.include_router(produtos.router, prefix="/produtos", tags=["produtos"])
app.include_router(carrinho.router, prefix="/carrinho", tags=["carrinho"])
app.include_router(pedidos.router, prefix="/pedidos", tags=["pedidos"])
app.include_router(configuracoes.router, prefix="/configuracoes", tags=["configuracoes"])


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
