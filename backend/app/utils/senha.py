from __future__ import annotations

import secrets

# Palavra-chave fácil de falar por telefone: ADJETIVO-ANIMAL-NN
_ADJ = [
    "AZUL", "VERDE", "DOURADO", "PRATA", "RUBRO", "VELOZ", "FORTE", "NOBRE",
    "CLARO", "VIVO", "LIVRE", "SERENO", "BRAVO", "AGIL", "SOLAR", "LUNAR",
]
_ANIMAL = [
    "TIGRE", "LEAO", "FALCAO", "LOBO", "AGUIA", "PUMA", "TUBARAO", "CONDOR",
    "JAGUAR", "GARCA", "RAPOSA", "CORVO", "TUCANO", "ONCA", "GAVIAO", "URSO",
]


def gerar_palavra_chave() -> str:
    """Gera uma palavra-chave aleatória e fácil de comunicar."""

    return f"{secrets.choice(_ADJ)}-{secrets.choice(_ANIMAL)}-{secrets.randbelow(90) + 10}"
