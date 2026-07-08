from __future__ import annotations

from typing import List
from uuid import uuid4

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.base import RepresentanteRepository
from app.schemas.endereco import (
    DefinirPrincipalResponse,
    EnderecoCreate,
    EnderecoListResponse,
    EnderecoResponse,
    EnderecoUpdate,
)


class EnderecoService:
    """Regras de negócio para endereços de entrega do representante.

    Os endereços ficam embutidos no documento do representante em
    `representantes.enderecos`.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.repo = RepresentanteRepository(db)

    async def listar_enderecos(self, representante_id: str) -> EnderecoListResponse:
        representante = await self._get_representante_or_404(representante_id)
        enderecos = [self._to_response(e) for e in representante.get("enderecos", [])]
        return EnderecoListResponse(items=enderecos)

    async def criar_endereco(
        self,
        representante_id: str,
        payload: EnderecoCreate,
    ) -> EnderecoResponse:
        representante = await self._get_representante_or_404(representante_id)
        enderecos = representante.get("enderecos", [])

        novo = payload.model_dump()
        novo["id"] = str(uuid4())

        if payload.eh_principal:
            # Garante unicidade do principal
            for e in enderecos:
                e["eh_principal"] = False
        else:
            # Se ainda não há endereço, força como principal
            if not enderecos:
                novo["eh_principal"] = True

        enderecos.append(novo)
        await self.repo.update_enderecos(representante_id, enderecos)

        return self._to_response(novo)

    async def atualizar_endereco(
        self,
        representante_id: str,
        endereco_id: str,
        payload: EnderecoUpdate,
    ) -> EnderecoResponse:
        representante = await self._get_representante_or_404(representante_id)
        enderecos: List[dict] = representante.get("enderecos", [])

        for e in enderecos:
            if e.get("id") == endereco_id:
                update_data = payload.model_dump(exclude_unset=True)
                e.update(update_data)
                await self.repo.update_enderecos(representante_id, enderecos)
                return self._to_response(e)

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endereço não encontrado",
        )

    async def deletar_endereco(self, representante_id: str, endereco_id: str) -> None:
        representante = await self._get_representante_or_404(representante_id)
        enderecos: List[dict] = representante.get("enderecos", [])

        novo_lista = [e for e in enderecos if e.get("id") != endereco_id]
        if len(novo_lista) == len(enderecos):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Endereço não encontrado",
            )

        # Se removemos o principal, elegemos outro como principal, se houver
        if not any(e.get("eh_principal") for e in novo_lista) and novo_lista:
            novo_lista[0]["eh_principal"] = True

        await self.repo.update_enderecos(representante_id, novo_lista)

    async def definir_principal(
        self,
        representante_id: str,
        endereco_id: str,
    ) -> DefinirPrincipalResponse:
        representante = await self._get_representante_or_404(representante_id)
        enderecos: List[dict] = representante.get("enderecos", [])

        found = None
        for e in enderecos:
            if e.get("id") == endereco_id:
                found = e
                e["eh_principal"] = True
            else:
                e["eh_principal"] = False

        if not found:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Endereço não encontrado",
            )

        await self.repo.update_enderecos(representante_id, enderecos)

        return DefinirPrincipalResponse(id=endereco_id, eh_principal=True)

    async def _get_representante_or_404(self, representante_id: str) -> dict:
        representante = await self.repo.get_by_id(representante_id)
        if not representante:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Representante não encontrado",
            )
        return representante

    def _to_response(self, data: dict) -> EnderecoResponse:
        return EnderecoResponse(**data)
