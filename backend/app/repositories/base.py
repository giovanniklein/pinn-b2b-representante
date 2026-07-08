from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError


class RepresentanteMultiTenantRepository:
    """Repositório base com filtro automático por `representante_id`.

    Nenhuma operação exposta aqui permite acesso a documentos de outro
    representante, garantindo o isolamento multi-tenant pedido.
    """

    def __init__(self, db: AsyncIOMotorDatabase, collection_name: str) -> None:
        self._db = db
        self._collection: AsyncIOMotorCollection = db[collection_name]

    async def count(
        self,
        representante_id: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Conta documentos do representante, aplicando filtros opcionais.

        Útil para paginação (`total`), sempre respeitando o isolamento
        multi-tenant pelo campo `representante_id`.
        """

        query: Dict[str, Any] = self._tenant_filter(representante_id)
        if filters:
            query.update(filters)
        return await self._collection.count_documents(query)

    # Helpers
    def _to_object_id(self, value: str) -> ObjectId:
        return ObjectId(value)

    def _tenant_filter(self, representante_id: str) -> Dict[str, Any]:
        return {"representante_id": representante_id}

    # CRUD utilitários básicos
    async def find_one(
        self,
        representante_id: str,
        document_id: str,
    ) -> Optional[Dict[str, Any]]:
        query = {"_id": self._to_object_id(document_id)}
        query.update(self._tenant_filter(representante_id))
        return await self._collection.find_one(query)

    async def find_many(
        self,
        representante_id: str,
        filters: Optional[Dict[str, Any]] = None,
        *,
        limit: int = 100,
        skip: int = 0,
        sort: Optional[List[tuple[str, int]]] = None,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = self._tenant_filter(representante_id)
        if filters:
            query.update(filters)

        cursor = self._collection.find(query).skip(skip).limit(limit)
        if sort:
            cursor = cursor.sort(sort)
        return [doc async for doc in cursor]

    async def insert_one(
        self,
        representante_id: str,
        data: Dict[str, Any],
    ) -> str:
        data["representante_id"] = representante_id
        result = await self._collection.insert_one(data)
        return str(result.inserted_id)

    async def update_one(
        self,
        representante_id: str,
        document_id: str,
        data: Dict[str, Any],
    ) -> bool:
        query = {"_id": self._to_object_id(document_id)}
        query.update(self._tenant_filter(representante_id))
        result = await self._collection.update_one(query, {"$set": data})
        return result.matched_count > 0

    async def delete_one(
        self,
        representante_id: str,
        document_id: str,
    ) -> bool:
        query = {"_id": self._to_object_id(document_id)}
        query.update(self._tenant_filter(representante_id))
        result = await self._collection.delete_one(query)
        return result.deleted_count > 0


class RepresentanteRepository:
    """Repositório para o cadastro de representantes.

    Os documentos desta coleção concentram os dados cadastrais
    (inclusive o array de endereços de entrega).
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db
        self._collection: AsyncIOMotorCollection = db["representantes"]

    async def find_by_cnpj(self, cnpj: str) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one({"cnpj": cnpj})

    async def find_by_email_ci(self, email: str) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one(
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
        )

    async def insert(self, data: Dict[str, Any]) -> str:
        result = await self._collection.insert_one(data)
        return str(result.inserted_id)

    async def get_by_id(self, representante_id: str) -> Optional[Dict[str, Any]]:
        try:
            object_id = ObjectId(representante_id)
        except (InvalidId, TypeError):
            return None
        return await self._collection.find_one({"_id": object_id})

    async def get_active_by_id(self, representante_id: str) -> Optional[Dict[str, Any]]:
        """Retorna o representante somente se estiver ativo.

        Regra de compatibilidade com ADM:
        - documentos legados sem campo `ativo` sao considerados ativos
        - `ativo=False` significa inativo
        """

        try:
            object_id = ObjectId(representante_id)
        except (InvalidId, TypeError):
            return None

        return await self._collection.find_one(
            {
                "_id": object_id,
                "$or": [{"ativo": {"$exists": False}}, {"ativo": True}],
            }
        )

    async def update_enderecos(
        self,
        representante_id: str,
        enderecos: List[Dict[str, Any]],
    ) -> None:
        await self._collection.update_one(
            {"_id": ObjectId(representante_id)},
            {"$set": {"enderecos": enderecos}},
        )


class RepresentanteUsuarioRepository:
    """Repositório de usuários do representante (coleção `usuarios`).

    Reaproveita a mesma coleção usada pelo app do atacadista, mas com
    campos específicos:
    - `tipo_usuario = "representante"`
    - `representante_id` em vez de `atacadista_id`
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db
        self._collection: AsyncIOMotorCollection = db["usuarios"]

    async def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one({"email": email, "tipo_usuario": "representante"})

    async def insert(self, data: Dict[str, Any]) -> str:
        result = await self._collection.insert_one(data)
        return str(result.inserted_id)

    async def find_by_email_any_tipo(self, email: str) -> Optional[Dict[str, Any]]:
        """Busca por e-mail sem filtrar tipo de usuário.

        Útil para garantir unicidade global de e-mail entre atacadista e
        representante, se desejado. Por ora, usamos apenas para verificar se
        já existe um usuário com o e-mail informado, independentemente do
        tipo.
        """

        return await self._collection.find_one({"email": email})

    async def find_by_email_any_tipo_ci(self, email: str) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one(
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
        )

    async def find_representante_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one(
            {"email": email, "tipo_usuario": "representante"}
        )


class CarrinhoRepository(RepresentanteMultiTenantRepository):
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        super().__init__(db, "carrinhos")

    async def get_carrinho_by_representante(self, representante_id: str) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one({"representante_id": representante_id})

    async def upsert_carrinho(self, representante_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        # Nunca envia _id no $set para evitar erro de campo imutavel no MongoDB.
        safe_data = {k: v for k, v in data.items() if k != "_id"}
        safe_data["representante_id"] = representante_id
        created_at = safe_data.pop("criado_em", None) or datetime.utcnow()
        try:
            result = await self._collection.find_one_and_update(
                {"representante_id": representante_id},
                {
                    "$set": safe_data,
                    "$setOnInsert": {"criado_em": created_at},
                },
                upsert=True,
                return_document=True,  # type: ignore[arg-type]
            )
        except DuplicateKeyError:
            # Corrida de insert simultaneo: um request criou e o outro repete.
            # Faz retry sem upsert para manter operacao idempotente.
            result = await self._collection.find_one_and_update(
                {"representante_id": representante_id},
                {"$set": safe_data},
                upsert=False,
                return_document=True,  # type: ignore[arg-type]
            )
        assert result is not None
        return result

    async def clear_carrinho(self, representante_id: str) -> None:
        await self._collection.delete_one({"representante_id": representante_id})


class RepresentantePedidoRepository(RepresentanteMultiTenantRepository):
    """Repositório de pedidos sob a ótica do representante.

    Compartilha a mesma coleção `pedidos` usada pelo app do atacadista,
    filtrando por `representante_id`.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        super().__init__(db, "pedidos")


class ProdutoLeituraRepository:
    """Repositório somente-leitura de produtos.

    Diferente do app do atacadista, aqui o representante enxerga produtos de
    **todos** os atacadistas, então não aplicamos filtro por tenant.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db
        self._collection: AsyncIOMotorCollection = db["produtos"]

    async def find_many(
        self,
        *,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 100,
        skip: int = 0,
        projection: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = filters or {}
        cursor = self._collection.find(query, projection).skip(skip).limit(limit)
        return [doc async for doc in cursor]

    async def find_many_image_first(
        self,
        *,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 100,
        skip: int = 0,
        projection: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        """Lista produtos priorizando os que têm imagem (sem imagem vão para o fim)."""

        has_img = {
            "$cond": [
                {
                    "$or": [
                        {"$gt": [{"$strLenCP": {"$ifNull": ["$image_url", ""]}}, 0]},
                        {"$gt": [{"$strLenCP": {"$ifNull": ["$thumb_url", ""]}}, 0]},
                    ]
                },
                1,
                0,
            ]
        }
        pipeline: List[Dict[str, Any]] = [
            {"$match": filters or {}},
            {"$addFields": {"_has_img": has_img}},
            {"$sort": {"_has_img": -1, "_id": -1}},
            {"$skip": skip},
            {"$limit": limit},
        ]
        if projection:
            pipeline.append({"$project": projection})
        return [doc async for doc in self._collection.aggregate(pipeline)]

    async def find_by_id(
        self,
        produto_id: str,
        projection: Optional[Dict[str, int]] = None,
    ) -> Optional[Dict[str, Any]]:
        return await self._collection.find_one({"_id": ObjectId(produto_id)}, projection)

    async def find_by_ids(
        self,
        produto_ids: list[str],
        projection: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        if not produto_ids:
            return []
        object_ids: list[ObjectId] = []
        for produto_id in produto_ids:
            try:
                object_ids.append(ObjectId(produto_id))
            except (InvalidId, TypeError):
                continue
        if not object_ids:
            return []
        cursor = self._collection.find({"_id": {"$in": object_ids}}, projection)
        return [doc async for doc in cursor]


class AtacadistaLeituraRepository:
    """Repositório de leitura de atacadistas (para pedido mínimo, exibição de nome, etc.)."""

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db
        self._collection: AsyncIOMotorCollection = db["atacadistas"]

    def _active_filter(self) -> Dict[str, Any]:
        # Ativo (controlado pelo ADM) e sem pausa de vendas (autocontrole do parceiro).
        return {
            "$and": [
                {"$or": [{"ativo": {"$exists": False}}, {"ativo": True}]},
                {"$or": [{"vendas_pausadas": {"$exists": False}}, {"vendas_pausadas": False}]},
            ]
        }

    def _venda_mais_filter(self) -> Dict[str, Any]:
        return {"$and": [self._active_filter(), {"participa_venda_mais": True}]}

    async def get_by_id(self, atacadista_id: str) -> Optional[Dict[str, Any]]:
        try:
            object_id = ObjectId(atacadista_id)
        except (InvalidId, TypeError):
            return None
        return await self._collection.find_one({"_id": object_id, **self._active_filter()})

    async def get_by_ids(self, atacadista_ids: list[str]) -> List[Dict[str, Any]]:
        """Busca múltiplos atacadistas de uma vez, útil para evitar N+1.

        Retorna uma lista de documentos completos da coleção `atacadistas`.
        """

        if not atacadista_ids:
            return []

        object_ids = []
        for _id in atacadista_ids:
            try:
                object_ids.append(ObjectId(_id))
            except (InvalidId, TypeError):
                continue
        if not object_ids:
            return []
        cursor = self._collection.find({"_id": {"$in": object_ids}, **self._active_filter()})
        return [doc async for doc in cursor]

    async def get_active_ids(self) -> List[str]:
        cursor = self._collection.find(self._active_filter(), {"_id": 1})
        return [str(doc["_id"]) async for doc in cursor]

    async def get_participantes_venda_mais(self) -> List[Dict[str, Any]]:
        cursor = self._collection.find(self._venda_mais_filter())
        return [doc async for doc in cursor]

    async def get_visiveis_para_cidades(self, cidades_norm: set[str]) -> List[Dict[str, Any]]:
        """Retorna atacadistas ativos visíveis para um cliente de dadas cidades.

        Regra: o parceiro é visível se atende alguma das cidades do cliente.
        Parceiros sem `cidades_atendidas` (legado) são visíveis a todos.
        Se o cliente não tiver cidade cadastrada, todos os ativos são
        retornados (não há como filtrar).
        """

        from app.utils.text import normalize_search_text

        docs = [doc async for doc in self._collection.find(self._active_filter())]
        if not cidades_norm:
            return docs

        visiveis: List[Dict[str, Any]] = []
        for doc in docs:
            atendidas = doc.get("cidades_atendidas") or []
            if not atendidas:
                visiveis.append(doc)  # legado: sem cobertura definida => visível a todos
                continue
            norm_atendidas = {normalize_search_text(c) for c in atendidas if c}
            if cidades_norm & norm_atendidas:
                visiveis.append(doc)
        return visiveis
