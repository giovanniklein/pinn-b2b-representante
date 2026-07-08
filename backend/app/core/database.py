from typing import AsyncGenerator

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import get_settings


_settings = get_settings()

_client: AsyncIOMotorClient | None = None


async def get_client() -> AsyncIOMotorClient:
    """Lazily create and return a shared Motor client instance."""

    global _client
    if _client is None:
        _client = AsyncIOMotorClient(_settings.resolved_mongodb_uri)
    return _client


async def get_database() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    """FastAPI dependency that yields the configured Mongo database."""

    client = await get_client()
    db = client[_settings.mongodb_database]
    try:
        yield db
    finally:
        # Não fechamos o client aqui para permitir reuso entre requisições.
        # O handler de shutdown da aplicação é responsável por fechar.
        ...


async def close_client() -> None:
    """Close the underlying MongoDB client (used on application shutdown)."""

    global _client
    if _client is not None:
        _client.close()
        _client = None
