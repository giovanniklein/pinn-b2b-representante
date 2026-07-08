from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ClienteEnderecoResponse(BaseModel):
    id: str = Field(default="principal")
    descricao: str = Field(default="Endereco principal")
    logradouro: str = Field(default="")
    numero: str = Field(default="")
    bairro: str = Field(default="")
    cidade: str = Field(default="")
    uf: str = Field(default="")
    cep: str = Field(default="")
    complemento: str | None = None
    eh_principal: bool = False


class ClienteListItem(BaseModel):
    id: str
    nome: str
    cnpj: str | None = None
    email: str | None = None
    cidade: str | None = None
    uf: str | None = None
    enderecos: list[ClienteEnderecoResponse] = Field(default_factory=list)


class ClienteListResponse(BaseModel):
    items: list[ClienteListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


def cliente_to_response(doc: dict[str, Any]) -> ClienteListItem:
    enderecos_raw = doc.get("enderecos") or []
    if not enderecos_raw:
        enderecos_raw = [
            {
                "id": "principal",
                "descricao": "Endereco principal",
                "logradouro": doc.get("endereco") or doc.get("logradouro") or "",
                "numero": doc.get("numero") or "",
                "bairro": doc.get("bairro") or "",
                "cidade": doc.get("cidade") or "",
                "uf": doc.get("uf") or doc.get("estado") or "",
                "cep": doc.get("cep") or "",
                "complemento": doc.get("complemento"),
                "eh_principal": True,
            }
        ]

    enderecos = [
        ClienteEnderecoResponse(
            id=str(endereco.get("id") or f"endereco-{index + 1}"),
            descricao=str(endereco.get("descricao") or "Endereco"),
            logradouro=str(endereco.get("logradouro") or endereco.get("endereco") or ""),
            numero=str(endereco.get("numero") or ""),
            bairro=str(endereco.get("bairro") or ""),
            cidade=str(endereco.get("cidade") or ""),
            uf=str(endereco.get("uf") or endereco.get("estado") or "").upper(),
            cep=str(endereco.get("cep") or ""),
            complemento=endereco.get("complemento"),
            eh_principal=bool(endereco.get("eh_principal") or index == 0),
        )
        for index, endereco in enumerate(enderecos_raw)
    ]
    principal = next((endereco for endereco in enderecos if endereco.eh_principal), None) or (enderecos[0] if enderecos else None)
    nome = doc.get("nome_fantasia") or doc.get("razao_social") or doc.get("nome") or doc.get("email") or "Cliente"
    return ClienteListItem(
        id=str(doc.get("_id")),
        nome=str(nome),
        cnpj=doc.get("cnpj"),
        email=doc.get("email"),
        cidade=principal.cidade if principal else None,
        uf=principal.uf if principal else None,
        enderecos=enderecos,
    )
