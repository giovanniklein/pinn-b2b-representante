from __future__ import annotations

from datetime import datetime
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.utils.dependencies import get_current_representante_id


router = APIRouter()

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]
RepresentanteDep = Annotated[str, Depends(get_current_representante_id)]


def _month_range(mes: str) -> tuple[datetime, datetime]:
    ano, m = int(mes[:4]), int(mes[5:7])
    ini = datetime(ano, m, 1)
    fim = datetime(ano + 1, 1, 1) if m == 12 else datetime(ano, m + 1, 1)
    return ini, fim


@router.get("/extrato")
async def extrato_representante(
    db: DbDep,
    representante_id: RepresentanteDep,
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
):
    """Extrato mensal de comissões do representante, com o cálculo de cada venda.

    - Vendas pelo VendeMais (feitas pelo rep): comissão = parte do representante.
    - Compras do próprio cliente vinculado (portal): comissão = metade da padrão.
    """

    ini, fim = _month_range(mes)
    filtro = {
        "representante_id": representante_id,
        "data_criacao": {"$gte": ini, "$lt": fim},
        "comissao_representante_valor": {"$gt": 0},
    }
    docs = [d async for d in db["pedidos"].find(filtro).sort("data_criacao", 1)]

    # Nomes dos parceiros
    atacadista_ids = {str(d.get("atacadista_id")) for d in docs if d.get("atacadista_id")}
    obj_ids = [ObjectId(a) for a in atacadista_ids if ObjectId.is_valid(a)]
    nomes: dict[str, str] = {}
    if obj_ids:
        async for a in db["atacadistas"].find({"_id": {"$in": obj_ids}}):
            nomes[str(a["_id"])] = a.get("nome_fantasia") or a.get("razao_social") or a.get("nome") or "--"

    linhas = []
    total = total_vm = total_portal = 0.0
    for d in docs:
        cr = float(d.get("comissao_representante_valor") or 0)
        v = float(d.get("valor_total") or 0)
        eh_vm = d.get("canal_venda") == "representante"
        canal = "VendeMais (você vendeu)" if eh_vm else "Portal (cliente comprou sozinho)"
        total += cr
        if eh_vm:
            total_vm += cr
        else:
            total_portal += cr
        linhas.append({
            "data": d.get("data_criacao"),
            "cliente": d.get("cliente_nome"),
            "documento": d.get("cliente_cnpj"),
            "parceiro": nomes.get(str(d.get("atacadista_id")), "--"),
            "canal": canal,
            "valor_total": round(v, 2),
            "comissao_percentual": d.get("comissao_representante_percentual"),
            "comissao": round(cr, 2),
            "status": d.get("status"),
        })

    return {
        "mes": mes,
        "linhas": linhas,
        "total_pedidos": len(docs),
        "total_comissao": round(total, 2),
        "total_vendamais": round(total_vm, 2),
        "total_portal": round(total_portal, 2),
    }
