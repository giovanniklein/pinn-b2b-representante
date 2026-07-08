from __future__ import annotations

from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.database import get_client
from app.core.security import get_password_hash
from app.repositories.base import RepresentanteRepository, RepresentanteUsuarioRepository


settings = get_settings()


SEED_CNPJ = "11.111.111/0001-11"
SEED_USER_EMAIL = "pinn_representante@pinn.com"
SEED_USER_NAME = "pinn_representante"
SEED_USER_PASSWORD = "pinn001"


async def _get_db() -> AsyncIOMotorDatabase:
    """Obtém instância do banco Mongo para operações de seed."""

    client = await get_client()
    return client[settings.mongodb_database]


async def seed_initial_data() -> None:
    """Cria dados iniciais para desenvolvimento do app do representante.

    - Representante Modelo (cnpj 11.111.111/0001-11)
    - Usuário principal vinculado (email pinn_representante@pinn.com / senha pinn001)
    - Endereço principal (mockado caso API real de CNPJ não seja usada aqui)
    - Endereço adicional

    A função é idempotente: pode ser executada múltiplas vezes sem
    duplicar registros.
    """

    db = await _get_db()

    representante_repo = RepresentanteRepository(db)
    usuario_repo = RepresentanteUsuarioRepository(db)

    # --- Representante Modelo ---
    existing_representante = await representante_repo.find_by_cnpj(SEED_CNPJ)
    if existing_representante:
        representante_id = str(existing_representante["_id"])
    else:
        from uuid import uuid4

        now = datetime.utcnow()

        principal_endereco = {
            "id": str(uuid4()),
            "descricao": "Endereço principal",
            "logradouro": "Rua Exemplo do Representante",
            "numero": "100",
            "bairro": "Centro",
            "cidade": "São Paulo",
            "uf": "SP",
            "cep": "01000-000",
            "complemento": "Sala 10",
            "eh_principal": True,
        }

        endereco_adicional = {
            "id": str(uuid4()),
            "descricao": "Depósito secundário",
            "logradouro": "Avenida Secundária",
            "numero": "200",
            "bairro": "Bairro Industrial",
            "cidade": "São Paulo",
            "uf": "SP",
            "cep": "02000-000",
            "complemento": None,
            "eh_principal": False,
        }

        representante_id = await representante_repo.insert(
            {
                "cnpj": SEED_CNPJ,
                "email": SEED_USER_EMAIL,
                "telefone": "+55 (11) 4000-0002",
                "razao_social": "Representante Modelo LTDA",
                "nome_fantasia": "Representante Modelo",
                "enderecos": [principal_endereco, endereco_adicional],
                "created_at": now,
                "updated_at": now,
            }
        )

    # --- Usuário principal padrão ---
    usuarios_coll = db["usuarios"]
    existing_user = await usuarios_coll.find_one({"email": SEED_USER_EMAIL})
    if not existing_user:
        now = datetime.utcnow()
        await usuario_repo.insert(
            {
                "tipo_usuario": "representante",
                "representante_id": representante_id,
                "nome": SEED_USER_NAME,
                "email": SEED_USER_EMAIL,
                "telefone": "+55 (11) 4000-0002",
                "senha_hash": get_password_hash(SEED_USER_PASSWORD),
                "is_admin": True,
                "created_at": now,
            }
        )

    # Carrinho inicial vazio não precisa de seed explícito; será criado
    # on-demand no primeiro uso.
