from __future__ import annotations

import re
from math import ceil
from typing import Dict, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.base import (
    AtacadistaLeituraRepository,
    ProdutoLeituraRepository,
)
from app.schemas.produto import ProdutoListResponse, ProdutoPreco, ProdutoResponse
from app.utils.text import normalize_search_text


class ProdutoLeituraService:
    """Serviço de consulta de produtos para o representante.

    O representante enxerga produtos dos parceiros ativos que participam do
    Venda Mais. A cobertura por cliente pode ser adicionada depois sem mudar
    o contrato do catalogo.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.repo = ProdutoLeituraRepository(db)
        self.atacadista_repo = AtacadistaLeituraRepository(db)

    async def _atacadistas_visiveis(self, representante_id: str | None) -> list[str]:
        """IDs dos parceiros participantes do Venda Mais."""

        docs = await self.atacadista_repo.get_participantes_venda_mais()
        return [str(d["_id"]) for d in docs]

    async def listar_parceiros_visiveis(self, representante_id: str | None) -> list[dict]:
        """Lista os parceiros disponíveis para o cliente escolher (seletor)."""

        docs = await self.atacadista_repo.get_participantes_venda_mais()
        parceiros = []
        for d in docs:
            nome = d.get("nome_fantasia") or d.get("razao_social") or d.get("nome") or ""
            parceiros.append({"id": str(d["_id"]), "nome": nome})
        parceiros.sort(key=lambda p: p["nome"].upper())
        return parceiros

    async def listar_produtos(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        query: str | None = None,
        atacadista_id: str | None = None,
        representante_id: str | None = None,
    ) -> ProdutoListResponse:
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 20

        skip = (page - 1) * page_size

        active_atacadista_ids = await self._atacadistas_visiveis(representante_id)
        if not active_atacadista_ids:
            return ProdutoListResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=1,
            )

        active_candidates: list[object] = []
        for _id in active_atacadista_ids:
            active_candidates.append(_id)
            if ObjectId.is_valid(_id):
                active_candidates.append(ObjectId(_id))

        filters: Dict[str, object] = {
            "atacadista_id": {"$in": active_candidates}
        }
        if query:
            # Busca parcial insensível a caixa E acentos: usa o campo
            # normalizado gravado no cadastro (agua encontra ÁGUA) com
            # fallback para registros legados sem o campo.
            term = re.escape(query.strip())
            term_normalizado = re.escape(normalize_search_text(query))
            filters["$or"] = [
                {"descricao_normalizada": {"$regex": term_normalizado, "$options": "i"}},
                {"descricao": {"$regex": term, "$options": "i"}},
            ]
        if atacadista_id:
            if atacadista_id not in active_atacadista_ids:
                return ProdutoListResponse(
                    items=[],
                    total=0,
                    page=page,
                    page_size=page_size,
                    total_pages=1,
                )
            candidatos: list[object] = [atacadista_id]
            if ObjectId.is_valid(atacadista_id):
                candidatos.append(ObjectId(atacadista_id))
            filters["atacadista_id"] = {"$in": candidatos}

        # Para simplicidade inicial, contamos todos os produtos que batem o filtro.
        # Caso o volume cresça, podemos otimizar.
        total_cursor = self.repo._collection.count_documents(filters)  # type: ignore[attr-defined]
        total = await total_cursor

        docs = await self.repo.find_many_image_first(
            filters=filters,
            limit=page_size,
            skip=skip,
            projection={
                "codigo": 1,
                "descricao": 1,
                "image_url": 1,
                "thumb_url": 1,
                "estoque": 1,
                "qtd_minima": 1,
                "qtd_maxima": 1,
                "precos": 1,
                "preco_unidade": 1,
                "preco_caixa": 1,
                "preco_palete": 1,
                "atacadista_id": 1,
            },
        )

        # Carrega dados de atacadistas em uma única consulta para preencher o nome
        atacadista_ids = {
            str(doc.get("atacadista_id"))
            for doc in docs
            if doc.get("atacadista_id") is not None
        }

        atacadistas = await self.atacadista_repo.get_by_ids(list(atacadista_ids))
        atacadista_por_id: Dict[str, dict] = {
            str(doc["_id"]): doc for doc in atacadistas
        }

        items = [
            self._to_response(doc, atacadista_por_id=atacadista_por_id)
            for doc in docs
        ]
        total_pages = ceil(total / page_size) if page_size else 1

        return ProdutoListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def obter_produto(
        self,
        produto_id: str,
        *,
        representante_id: str | None = None,
    ) -> Optional[ProdutoResponse]:
        doc = await self.repo.find_by_id(produto_id)
        if not doc:
            return None

        atacadista_id = str(doc.get("atacadista_id")) if doc.get("atacadista_id") else None
        atacadista_por_id: Dict[str, dict] = {}
        if atacadista_id:
            atacadista = await self.atacadista_repo.get_by_id(atacadista_id)
            if not atacadista:
                # Produto de atacadista inativo não deve ser visível ao representante.
                return None
            # Respeita a cobertura por cidade: se o parceiro não atende a
            # cidade do cliente, o produto não é acessível.
            if representante_id is not None:
                visiveis = await self._atacadistas_visiveis(representante_id)
                if atacadista_id not in visiveis:
                    return None
            atacadista_por_id[atacadista_id] = atacadista

        return self._to_response(doc, atacadista_por_id=atacadista_por_id)

    def _to_response(
        self,
        doc: dict,
        *,
        atacadista_por_id: Dict[str, dict],
    ) -> ProdutoResponse:
        atacadista_id = str(doc.get("atacadista_id")) if doc.get("atacadista_id") else ""
        atacadista_doc = atacadista_por_id.get(atacadista_id)
        atacadista_nome: Optional[str] = None
        if atacadista_doc:
            atacadista_nome = (
                atacadista_doc.get("nome_fantasia")
                or atacadista_doc.get("razao_social")
                or atacadista_doc.get("nome")
            )

        precos_raw = doc.get("precos") or []
        precos: list[ProdutoPreco] = []
        for item in precos_raw:
            unidade = item.get("unidade")
            preco = item.get("preco")
            quantidade_unidades_raw = (
                item.get("quantidade_unidades")
                or item.get("qtd_unidades")
                or 1
            )
            try:
                quantidade_unidades = max(int(quantidade_unidades_raw), 1)
            except (TypeError, ValueError):
                quantidade_unidades = 1
            if unidade and preco is not None:
                precos.append(
                    ProdutoPreco(
                        unidade=str(unidade),
                        preco=float(preco),
                        quantidade_unidades=quantidade_unidades,
                    )
                )

        if not precos:
            if doc.get("preco_unidade") is not None:
                precos.append(
                    ProdutoPreco(
                        unidade="unidade",
                        preco=float(doc.get("preco_unidade")),
                        quantidade_unidades=1,
                    )
                )
            if doc.get("preco_caixa") is not None:
                precos.append(
                    ProdutoPreco(
                        unidade="caixa",
                        preco=float(doc.get("preco_caixa")),
                        quantidade_unidades=1,
                    )
                )
            if doc.get("preco_palete") is not None:
                precos.append(
                    ProdutoPreco(
                        unidade="palete",
                        preco=float(doc.get("preco_palete")),
                        quantidade_unidades=1,
                    )
                )

        def _find_preco(unidade: str) -> Optional[float]:
            for item in precos:
                if item.unidade == unidade:
                    return float(item.preco)
            return None

        preco_unidade = _find_preco("unidade") or doc.get("preco_unidade")
        preco_caixa = _find_preco("caixa") or doc.get("preco_caixa")
        preco_palete = _find_preco("palete") or doc.get("preco_palete")

        return ProdutoResponse(
            id=str(doc["_id"]),
            codigo=doc.get("codigo", ""),
            descricao=doc.get("descricao", ""),
            image_url=doc.get("image_url"),
            thumb_url=doc.get("thumb_url"),
            imagem_base64=doc.get("imagem_base64"),
            estoque=doc.get("estoque", 0),
            qtd_minima=doc.get("qtd_minima"),
            qtd_maxima=doc.get("qtd_maxima"),
            precos=precos,
            preco_unidade=preco_unidade,
            preco_caixa=preco_caixa,
            preco_palete=preco_palete,
            atacadista_id=atacadista_id,
            atacadista_nome=atacadista_nome,
        )
