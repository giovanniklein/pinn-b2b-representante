from __future__ import annotations

from typing import Any, Dict

import httpx
from fastapi import HTTPException, status


class CNPJService:
    """Serviço de integração com a API pública de CNPJ.

    Documentação/Exemplo: https://publica.cnpj.ws/cnpj/{cnpj}

    Este serviço é utilizado no auto-registro do **representante** para
    preencher automaticamente dados cadastrais e de endereço principal.
    """

    BASE_URL = "https://publica.cnpj.ws/cnpj/"

    async def buscar_dados(self, cnpj: str) -> Dict[str, Any]:
        """Busca dados de CNPJ na API pública e extrai campos relevantes.

        Normaliza o CNPJ removendo caracteres não numéricos.
        """

        somente_digitos = "".join(filter(str.isdigit, cnpj))
        if len(somente_digitos) != 14:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CNPJ inválido",
            )

        url = f"{self.BASE_URL}{somente_digitos}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(url)
            except httpx.RequestError as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Falha ao consultar serviço de CNPJ",
                ) from exc

        if resp.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="CNPJ não encontrado na base pública",
            )

        if resp.status_code >= 500:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Serviço de CNPJ indisponível no momento",
            )

        data = resp.json()

        estabelecimento = data.get("estabelecimento", {}) or {}
        cidade = estabelecimento.get("cidade") or {}
        estado = estabelecimento.get("estado") or {}

        return {
            "razao_social": data.get("razao_social"),
            "nome_fantasia": estabelecimento.get("nome_fantasia")
            or data.get("razao_social"),
            # Campos de endereço detalhados
            "logradouro": estabelecimento.get("logradouro"),
            "numero": estabelecimento.get("numero"),
            "bairro": estabelecimento.get("bairro"),
            "cidade": cidade.get("nome"),
            "uf": estado.get("sigla"),
            "cep": estabelecimento.get("cep"),
            "complemento": estabelecimento.get("complemento"),
            # Contatos
            "telefone": estabelecimento.get("telefone1") or estabelecimento.get("telefone2"),
            "email": estabelecimento.get("email"),
        }

    async def buscar_dados_opcional(self, cnpj: str) -> Dict[str, Any] | None:
        """Versão best-effort usada no cadastro de clientes pelo representante.

        Retorna ``None`` (em vez de lançar erro) quando o CNPJ é inválido, não
        é encontrado ou a API está indisponível, de modo que o cadastro possa
        prosseguir com os dados informados manualmente.
        """

        try:
            return await self.buscar_dados(cnpj)
        except HTTPException:
            return None
