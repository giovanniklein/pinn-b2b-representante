from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.repositories.base import (
    AtacadistaLeituraRepository,
    CarrinhoRepository,
    documento_atende_cliente,
    ProdutoLeituraRepository,
    RepresentantePedidoRepository,
    RepresentanteRepository,
    VarejistaLeituraRepository,
)
from app.schemas.carrinho import (
    CarrinhoItemRequest,
    CarrinhoItemResponse,
    CarrinhoItemUpdateRequest,
    CarrinhoResponse,
    FinalizarCarrinhoRequest,
    FinalizarCarrinhoResponse,
    PedidoGeradoResumo,
)
from app.utils.senha import gerar_palavra_chave


settings = get_settings()

PRODUTO_CARRINHO_PROJECTION = {
    "_id": 1,
    "atacadista_id": 1,
    "descricao": 1,
    "qtd_minima": 1,
    "qtd_maxima": 1,
    "precos": 1,
    "preco_unidade": 1,
    "preco_caixa": 1,
    "preco_palete": 1,
}


def _validar_limites_quantidade(produto: Dict, quantidade: int) -> None:
    """Valida a quantidade contra os limites de venda definidos pelo parceiro."""

    descricao = produto.get("descricao", "produto")
    qtd_minima = produto.get("qtd_minima")
    qtd_maxima = produto.get("qtd_maxima")

    if qtd_minima is not None and quantidade < int(qtd_minima):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quantidade mínima para {descricao} é {int(qtd_minima)}.",
        )
    if qtd_maxima is not None and quantidade > int(qtd_maxima):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quantidade máxima para {descricao} é {int(qtd_maxima)}.",
        )


class CarrinhoService:
    """Regras de negocio para o carrinho multi-atacadista do representante."""

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.carrinho_repo = CarrinhoRepository(db)
        self.produto_repo = ProdutoLeituraRepository(db)
        self.atacadista_repo = AtacadistaLeituraRepository(db)
        self.pedido_repo = RepresentantePedidoRepository(db)
        self.representante_repo = RepresentanteRepository(db)
        self.varejista_repo = VarejistaLeituraRepository(db)

    async def obter_carrinho(self, representante_id: str) -> CarrinhoResponse:
        doc = await self.carrinho_repo.get_carrinho_by_representante(representante_id)
        if not doc:
            return CarrinhoResponse(
                itens=[],
                condicoes_pagamento_por_atacadista={},
                valor_total=0.0,
                atualizado_em=None,
            )

        atacadista_ids = {str(item["atacadista_id"]) for item in doc.get("itens", [])}
        atacadistas = await self.atacadista_repo.get_by_ids(list(atacadista_ids))
        atacadista_por_id = {str(a["_id"]): a for a in atacadistas}
        condicoes_por_atacadista = {
            atacadista_id: self._normalize_condicoes_pagamento(atacadista_doc)
            for atacadista_id, atacadista_doc in atacadista_por_id.items()
        }

        itens_resp: List[CarrinhoItemResponse] = []
        for item in doc.get("itens", []):
            if str(item.get("atacadista_id")) not in atacadista_por_id:
                # Não exibe itens de atacadistas inativos.
                continue
            produto = await self.produto_repo.find_by_id(
                item["produto_id"],
                projection=PRODUTO_CARRINHO_PROJECTION,
            )
            precos = self._extract_precos_produto(produto)
            itens_resp.append(
                CarrinhoItemResponse(
                    produto_id=item["produto_id"],
                    descricao_produto=item.get("descricao_produto"),
                    atacadista_id=item["atacadista_id"],
                    atacadista_nome=(
                        atacadista_por_id.get(str(item["atacadista_id"]), {}).get(
                            "nome_fantasia"
                        )
                        or atacadista_por_id.get(str(item["atacadista_id"]), {}).get(
                            "razao_social"
                        )
                        or atacadista_por_id.get(str(item["atacadista_id"]), {}).get("nome")
                    ),
                    quantidade=item["quantidade"],
                    unidade_medida=item["unidade_medida"],
                    preco_unitario=item["preco_unitario"],
                    subtotal=item["subtotal"],
                    qtd_minima=(produto or {}).get("qtd_minima"),
                    qtd_maxima=(produto or {}).get("qtd_maxima"),
                    precos=precos,
                )
            )

        return CarrinhoResponse(
            itens=itens_resp,
            condicoes_pagamento_por_atacadista=condicoes_por_atacadista,
            valor_total=round(sum(item.subtotal for item in itens_resp), 2),
            atualizado_em=doc.get("atualizado_em"),
        )

    async def adicionar_ou_atualizar_item(
        self,
        representante_id: str,
        payload: CarrinhoItemRequest,
    ) -> CarrinhoResponse:
        """Adiciona um item ao carrinho ou atualiza sua quantidade."""

        produto = await self.produto_repo.find_by_id(
            payload.produto_id,
            projection=PRODUTO_CARRINHO_PROJECTION,
        )
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto nao encontrado",
            )

        if str(produto.get("atacadista_id")) != payload.atacadista_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Produto nao pertence ao atacadista informado",
            )

        atacadista = await self.atacadista_repo.get_by_id(payload.atacadista_id)
        if not atacadista:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Atacadista inativo ou nao encontrado",
            )

        _validar_limites_quantidade(produto, payload.quantidade)

        descricao_produto = produto.get("descricao", "")
        preco_unitario = self._obter_preco_por_unidade(produto, payload.unidade_medida)

        carrinho_doc = await self.carrinho_repo.get_carrinho_by_representante(representante_id)
        if not carrinho_doc:
            carrinho_doc = {
                "representante_id": representante_id,
                "itens": [],
                "valor_total": 0.0,
                "atualizado_em": datetime.utcnow(),
            }

        itens: List[Dict] = carrinho_doc.get("itens", [])

        encontrado = False
        for item in itens:
            if (
                item["produto_id"] == payload.produto_id
                and item["atacadista_id"] == payload.atacadista_id
            ):
                item["quantidade"] = payload.quantidade
                item["unidade_medida"] = payload.unidade_medida
                item["preco_unitario"] = preco_unitario
                item["subtotal"] = round(preco_unitario * payload.quantidade, 2)
                item["descricao_produto"] = descricao_produto
                encontrado = True
                break

        if not encontrado:
            itens.append(
                {
                    "produto_id": payload.produto_id,
                    "descricao_produto": descricao_produto,
                    "atacadista_id": payload.atacadista_id,
                    "quantidade": payload.quantidade,
                    "unidade_medida": payload.unidade_medida,
                    "preco_unitario": preco_unitario,
                    "subtotal": round(preco_unitario * payload.quantidade, 2),
                }
            )

        carrinho_doc["itens"] = itens
        carrinho_doc["valor_total"] = round(sum(item["subtotal"] for item in itens), 2)
        carrinho_doc["atualizado_em"] = datetime.utcnow()

        await self.carrinho_repo.upsert_carrinho(representante_id, carrinho_doc)
        return await self.obter_carrinho(representante_id)

    async def atualizar_item(
        self,
        representante_id: str,
        produto_id: str,
        payload: CarrinhoItemUpdateRequest,
    ) -> CarrinhoResponse:
        carrinho_doc = await self.carrinho_repo.get_carrinho_by_representante(representante_id)
        if not carrinho_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Carrinho nao encontrado",
            )

        itens: List[Dict] = carrinho_doc.get("itens", [])

        for item in itens:
            if item["produto_id"] == produto_id:
                if payload.quantidade == 0:
                    itens.remove(item)
                    break

                unidade = payload.unidade_medida or item["unidade_medida"]
                produto = await self.produto_repo.find_by_id(
                    produto_id,
                    projection=PRODUTO_CARRINHO_PROJECTION,
                )
                if not produto:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Produto nao encontrado",
                    )

                _validar_limites_quantidade(produto, payload.quantidade)

                preco_unitario = self._obter_preco_por_unidade(produto, unidade)

                item["quantidade"] = payload.quantidade
                item["unidade_medida"] = unidade
                item["preco_unitario"] = preco_unitario
                item["subtotal"] = round(preco_unitario * payload.quantidade, 2)
                item["descricao_produto"] = produto.get("descricao", "")
                break
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item nao encontrado no carrinho",
            )

        carrinho_doc["itens"] = itens
        carrinho_doc["valor_total"] = round(sum(i["subtotal"] for i in itens), 2)
        carrinho_doc["atualizado_em"] = datetime.utcnow()

        await self.carrinho_repo.upsert_carrinho(representante_id, carrinho_doc)
        return await self.obter_carrinho(representante_id)

    async def remover_item(self, representante_id: str, produto_id: str) -> CarrinhoResponse:
        carrinho_doc = await self.carrinho_repo.get_carrinho_by_representante(representante_id)
        if not carrinho_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Carrinho nao encontrado",
            )

        itens: List[Dict] = carrinho_doc.get("itens", [])
        nova_lista = [i for i in itens if i["produto_id"] != produto_id]

        if len(nova_lista) == len(itens):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item nao encontrado no carrinho",
            )

        carrinho_doc["itens"] = nova_lista
        carrinho_doc["valor_total"] = round(sum(i["subtotal"] for i in nova_lista), 2)
        carrinho_doc["atualizado_em"] = datetime.utcnow()

        if not nova_lista:
            await self.carrinho_repo.clear_carrinho(representante_id)
            return CarrinhoResponse(itens=[], valor_total=0.0, atualizado_em=None)

        await self.carrinho_repo.upsert_carrinho(representante_id, carrinho_doc)
        return await self.obter_carrinho(representante_id)

    async def limpar_carrinho(self, representante_id: str) -> None:
        await self.carrinho_repo.clear_carrinho(representante_id)

    async def finalizar_carrinho(
        self,
        representante_id: str,
        payload: FinalizarCarrinhoRequest,
    ) -> FinalizarCarrinhoResponse:
        """Finaliza o carrinho gerando multiplos pedidos (um por atacadista)."""

        carrinho_doc = await self.carrinho_repo.get_carrinho_by_representante(representante_id)
        if not carrinho_doc or not carrinho_doc.get("itens"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Carrinho vazio",
            )

        endereco_map: Dict[str, str] = {e.atacadista_id: e.endereco_id for e in payload.enderecos}
        condicao_pagamento_map: Dict[str, str | None] = {
            e.atacadista_id: e.condicao_pagamento for e in payload.enderecos
        }
        observacao_map: Dict[str, str | None] = {
            e.atacadista_id: e.observacao for e in payload.enderecos
        }

        atacadistas_no_carrinho = {item["atacadista_id"] for item in carrinho_doc["itens"]}
        for atacadista_id in atacadistas_no_carrinho:
            if atacadista_id not in endereco_map:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Endereco de entrega nao informado para o atacadista {atacadista_id}",
                )

        representante = await self.representante_repo.get_by_id(representante_id)
        if not representante:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Representante nao encontrado",
            )

        cliente = await self.varejista_repo.get_by_id(payload.cliente_id)
        if not cliente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente nao encontrado",
            )
        if not self.representante_repo.atende_cliente(representante, cliente):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cliente fora da area de atendimento do representante",
            )

        cliente_enderecos = self._normalizar_enderecos_cliente(cliente)
        enderecos_por_id: Dict[str, Dict] = {e["id"]: e for e in cliente_enderecos}
        cliente_nome = cliente.get("nome_fantasia") or cliente.get("razao_social") or cliente.get("nome") or cliente.get("email")

        itens_por_atacadista: Dict[str, List[Dict]] = defaultdict(list)
        for item in carrinho_doc["itens"]:
            itens_por_atacadista[item["atacadista_id"]].append(item)

        pedidos_gerados: List[PedidoGeradoResumo] = []

        for atacadista_id, itens in itens_por_atacadista.items():
            atacadista = await self.atacadista_repo.get_by_id(atacadista_id)
            if not atacadista:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Atacadista {atacadista_id} inativo ou nao encontrado",
                )
            if not atacadista.get("participa_venda_mais"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Atacadista {atacadista_id} nao participa do Venda Mais",
                )
            if not documento_atende_cliente(atacadista, cliente):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Atacadista {atacadista_id} nao atende o cliente selecionado",
                )

            condicoes_ofertadas = self._normalize_condicoes_pagamento(atacadista)
            condicao_pagamento = (condicao_pagamento_map.get(atacadista_id) or "A VISTA").strip()
            if condicao_pagamento not in condicoes_ofertadas:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Condicao de pagamento invalida para o atacadista "
                        f"{atacadista.get('nome_fantasia', atacadista_id)}"
                    ),
                )

            # Revalida limites de quantidade por produto antes de gerar o pedido.
            for item in itens:
                produto = await self.produto_repo.find_by_id(
                    str(item["produto_id"]),
                    projection=PRODUTO_CARRINHO_PROJECTION,
                )
                if produto:
                    _validar_limites_quantidade(produto, int(item["quantidade"]))

            pedido_minimo = float(atacadista.get("pedido_minimo", 150.0))
            valor_total = round(sum(i["subtotal"] for i in itens), 2)

            if valor_total < pedido_minimo:
                faltante = round(pedido_minimo - valor_total, 2)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "MIN_ORDER_NOT_REACHED",
                        "atacadista_id": atacadista_id,
                        "atacadista_nome": (
                            atacadista.get("nome_fantasia")
                            or atacadista.get("razao_social")
                            or atacadista.get("nome")
                            or atacadista_id
                        ),
                        "valor_total_atual": valor_total,
                        "pedido_minimo": pedido_minimo,
                        "faltante": faltante,
                        "message": (
                            f"Pedido minimo para o atacadista "
                            f"{atacadista.get('nome_fantasia', atacadista_id)} nao atingido: "
                            f"R$ {valor_total:.2f}/{pedido_minimo:.2f}"
                        ),
                    },
                )

            endereco_id = endereco_map[atacadista_id]
            endereco_entrega = enderecos_por_id.get(endereco_id)
            if not endereco_entrega:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Endereco de entrega selecionado nao encontrado para o atacadista {atacadista_id}"
                    ),
                )

            observacao_representante = (observacao_map.get(atacadista_id) or "").strip() or None
            comissao = await self._calcular_comissao_venda_mais(valor_total)

            # Senha por compra (palavra-chave), conforme configuração do parceiro.
            senha_compra = None
            modo_senha = atacadista.get("senha_compra_modo") or "desligado"
            if modo_senha == "toda":
                senha_compra = gerar_palavra_chave()
            elif modo_senha == "primeiras":
                qtd_senha = int(atacadista.get("senha_compra_qtd") or 1)
                ja_feitos = await self.pedido_repo.count(
                    representante_id, filters={"atacadista_id": atacadista_id}
                )
                if ja_feitos < qtd_senha:
                    senha_compra = gerar_palavra_chave()

            pedido_doc = {
                "origem_venda": "venda_mais",
                "atacadista_id": atacadista_id,
                "representante_id": representante_id,
                "representante_nome": (
                    representante.get("nome_fantasia")
                    or representante.get("razao_social")
                    or representante.get("nome")
                ),
                "cliente_id": payload.cliente_id,
                "cliente_nome": cliente_nome,
                "cliente_cnpj": cliente.get("cnpj"),
                "cliente_snapshot": {
                    "id": payload.cliente_id,
                    "nome": cliente_nome,
                    "cnpj": cliente.get("cnpj"),
                    "email": cliente.get("email"),
                },
                "condicao_pagamento": condicao_pagamento,
                "observacao_representante": observacao_representante,
                "senha_compra": senha_compra,
                "senha_confirmada": False,
                "endereco_entrega": endereco_entrega,
                "itens": [
                    {
                        "produto_id": item["produto_id"],
                        "descricao_produto": await self._get_descricao_produto(item["produto_id"]),
                        "unidade": item["unidade_medida"],
                        "quantidade_unidades": await self._get_quantidade_unidades_produto(
                            item["produto_id"],
                            item["unidade_medida"],
                        ),
                        "quantidade": item["quantidade"],
                        "valor_unitario": item["preco_unitario"],
                        "valor_total": item["subtotal"],
                    }
                    for item in itens
                ],
                "valor_total": valor_total,
                "comissao_total_percentual": comissao["percentual_total"],
                "comissao_total_valor": comissao["valor_total_comissao"],
                # Sem split representante/KIPI (comissão única no Plano VendeMais).
                "comissao_representante_percentual": None,
                "comissao_kipi_percentual": None,
                "comissao_representante_valor": None,
                "comissao_kipi_valor": None,
                "comissao_status": "prevista",
                "status": "pendente",
                "data_criacao": datetime.utcnow(),
            }

            pedido_id = await self.pedido_repo.insert_one(representante_id, pedido_doc)
            pedidos_gerados.append(
                PedidoGeradoResumo(
                    pedido_id=pedido_id,
                    atacadista_id=atacadista_id,
                    valor_total=valor_total,
                )
            )

        await self.carrinho_repo.clear_carrinho(representante_id)

        return FinalizarCarrinhoResponse(pedidos_gerados=pedidos_gerados)

    async def listar_pedidos_representante(
        self,
        representante_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Dict], int]:
        active_atacadista_ids = await self.atacadista_repo.get_active_ids()
        if not active_atacadista_ids:
            return [], 0

        active_candidates: List[object] = []
        for _id in active_atacadista_ids:
            active_candidates.append(_id)
            if ObjectId.is_valid(_id):
                active_candidates.append(ObjectId(_id))

        filtros = {"atacadista_id": {"$in": active_candidates}}
        skip = (page - 1) * page_size
        docs = await self.pedido_repo.find_many(
            representante_id,
            filters=filtros,
            limit=page_size,
            skip=skip,
            sort=[("data_criacao", -1)],
        )
        total = await self.pedido_repo.count(representante_id, filters=filtros)
        return docs, total

    async def obter_pedido_representante(self, representante_id: str, pedido_id: str) -> Dict:
        doc = await self.pedido_repo.find_one(representante_id, pedido_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido nao encontrado",
            )

        atacadista_id = str(doc.get("atacadista_id", ""))
        if not atacadista_id or not await self.atacadista_repo.get_by_id(atacadista_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido nao encontrado",
            )
        return doc

    async def duplicar_pedido(self, representante_id: str, pedido_id: str) -> CarrinhoResponse:
        pedido = await self.pedido_repo.find_one(representante_id, pedido_id)
        if not pedido:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pedido nao encontrado",
            )

        carrinho_doc = await self.carrinho_repo.get_carrinho_by_representante(representante_id)
        if not carrinho_doc:
            carrinho_doc = {
                "representante_id": representante_id,
                "itens": [],
                "valor_total": 0.0,
                "atualizado_em": datetime.utcnow(),
            }

        itens: List[Dict] = carrinho_doc.get("itens", [])
        atacadista_id = str(pedido.get("atacadista_id", ""))

        for pedido_item in pedido.get("itens", []):
            produto_id = str(pedido_item.get("produto_id"))
            unidade = str(pedido_item.get("unidade", ""))
            quantidade = int(pedido_item.get("quantidade", 0))

            if not produto_id or not unidade or quantidade <= 0:
                continue

            produto = await self.produto_repo.find_by_id(
                produto_id,
                projection=PRODUTO_CARRINHO_PROJECTION,
            )
            if not produto:
                continue

            preco_unitario = self._obter_preco_por_unidade(produto, unidade)
            descricao_produto = produto.get("descricao", "")

            encontrado = False
            for item in itens:
                if (
                    item["produto_id"] == produto_id
                    and item["atacadista_id"] == atacadista_id
                    and item["unidade_medida"] == unidade
                ):
                    nova_quantidade = item["quantidade"] + quantidade
                    item["quantidade"] = nova_quantidade
                    item["preco_unitario"] = preco_unitario
                    item["subtotal"] = round(preco_unitario * nova_quantidade, 2)
                    item["descricao_produto"] = descricao_produto
                    encontrado = True
                    break

            if not encontrado:
                itens.append(
                    {
                        "produto_id": produto_id,
                        "descricao_produto": descricao_produto,
                        "atacadista_id": atacadista_id,
                        "quantidade": quantidade,
                        "unidade_medida": unidade,
                        "preco_unitario": preco_unitario,
                        "subtotal": round(preco_unitario * quantidade, 2),
                    }
                )

        carrinho_doc["itens"] = itens
        carrinho_doc["valor_total"] = round(sum(item["subtotal"] for item in itens), 2)
        carrinho_doc["atualizado_em"] = datetime.utcnow()

        await self.carrinho_repo.upsert_carrinho(representante_id, carrinho_doc)
        return await self.obter_carrinho(representante_id)

    def _normalizar_enderecos_cliente(self, cliente: Dict) -> List[Dict]:
        enderecos_raw = cliente.get("enderecos") or []
        if not enderecos_raw:
            enderecos_raw = [
                {
                    "id": "principal",
                    "descricao": "Endereco principal",
                    "logradouro": cliente.get("endereco") or cliente.get("logradouro") or "",
                    "numero": cliente.get("numero") or "",
                    "bairro": cliente.get("bairro") or "",
                    "cidade": cliente.get("cidade") or "",
                    "uf": cliente.get("uf") or cliente.get("estado") or "",
                    "cep": cliente.get("cep") or "",
                    "complemento": cliente.get("complemento"),
                    "eh_principal": True,
                }
            ]

        enderecos: List[Dict] = []
        for index, endereco in enumerate(enderecos_raw):
            enderecos.append(
                {
                    "id": str(endereco.get("id") or f"endereco-{index + 1}"),
                    "descricao": str(endereco.get("descricao") or "Endereco"),
                    "logradouro": str(endereco.get("logradouro") or endereco.get("endereco") or ""),
                    "numero": str(endereco.get("numero") or ""),
                    "bairro": str(endereco.get("bairro") or ""),
                    "cidade": str(endereco.get("cidade") or ""),
                    "uf": str(endereco.get("uf") or endereco.get("estado") or "").upper(),
                    "cep": str(endereco.get("cep") or ""),
                    "complemento": endereco.get("complemento"),
                    "eh_principal": bool(endereco.get("eh_principal") or index == 0),
                }
            )
        return enderecos

    async def _calcular_comissao_venda_mais(self, valor_total: float) -> dict:
        # Plano VendeMais: comissão ÚNICA sobre a venda (sem split representante/KIPI).
        config = await self.db["configuracoes"].find_one({"tipo": "app"}) or {}
        percentual = float(config.get("comissao_venda_mais", settings.comissao_venda_mais))
        valor_comissao = round(valor_total * percentual, 2)
        return {
            "percentual_total": percentual,
            "valor_total_comissao": valor_comissao,
        }

    def _obter_preco_por_unidade(self, produto: Dict, unidade: str) -> float:
        precos = produto.get("precos") or []
        for item in precos:
            if item.get("unidade") == unidade:
                preco = item.get("preco")
                if preco is not None:
                    return float(preco)

        if unidade == "unidade":
            preco = produto.get("preco_unidade")
        elif unidade == "caixa":
            preco = produto.get("preco_caixa")
        elif unidade == "palete":
            preco = produto.get("preco_palete")
        else:
            preco = None

        if preco is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unidade de medida nao disponivel para este produto",
            )

        return float(preco)

    async def _get_precos_produto(self, produto_id: str) -> List[Dict]:
        produto = await self.produto_repo.find_by_id(
            produto_id,
            projection=PRODUTO_CARRINHO_PROJECTION,
        )
        return self._extract_precos_produto(produto)

    def _extract_precos_produto(self, produto: Dict | None) -> List[Dict]:
        if not produto:
            return []

        precos_raw = produto.get("precos") or []
        precos: List[Dict] = []
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
                    {
                        "unidade": str(unidade),
                        "preco": float(preco),
                        "quantidade_unidades": quantidade_unidades,
                    }
                )

        if not precos:
            if produto.get("preco_unidade") is not None:
                precos.append(
                    {
                        "unidade": "unidade",
                        "preco": float(produto.get("preco_unidade")),
                        "quantidade_unidades": 1,
                    }
                )
            if produto.get("preco_caixa") is not None:
                precos.append(
                    {
                        "unidade": "caixa",
                        "preco": float(produto.get("preco_caixa")),
                        "quantidade_unidades": 1,
                    }
                )
            if produto.get("preco_palete") is not None:
                precos.append(
                    {
                        "unidade": "palete",
                        "preco": float(produto.get("preco_palete")),
                        "quantidade_unidades": 1,
                    }
                )

        return precos

    async def _get_descricao_produto(self, produto_id: str) -> str:
        produto = await self.produto_repo.find_by_id(
            produto_id,
            projection={"descricao": 1},
        )
        if not produto:
            return ""
        return produto.get("descricao", "")

    async def _get_quantidade_unidades_produto(self, produto_id: str, unidade: str) -> int:
        produto = await self.produto_repo.find_by_id(
            produto_id,
            projection={"precos": 1},
        )
        if not produto:
            return 1

        precos = produto.get("precos") or []
        for item in precos:
            if item.get("unidade") == unidade:
                quantidade_unidades_raw = (
                    item.get("quantidade_unidades")
                    or item.get("qtd_unidades")
                    or 1
                )
                try:
                    return max(int(quantidade_unidades_raw), 1)
                except (TypeError, ValueError):
                    return 1

        return 1

    def _normalize_condicoes_pagamento(self, atacadista_doc: Dict) -> List[str]:
        condicoes_raw = atacadista_doc.get("condicoes_pagamento") or ["A VISTA"]

        condicoes: List[str] = []
        for condicao in condicoes_raw:
            if not condicao:
                continue
            valor = str(condicao).strip().upper()
            if valor and valor not in condicoes:
                condicoes.append(valor)

        if "A VISTA" not in condicoes:
            condicoes.insert(0, "A VISTA")

        return condicoes
