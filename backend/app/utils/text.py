from __future__ import annotations

import unicodedata
from typing import Optional


def normalize_search_text(value: Optional[str]) -> str:
    """Remove acentos e baixa a caixa para busca insensível (ÁGUA == agua)."""

    if not value:
        return ""
    decomposed = unicodedata.normalize("NFD", value)
    without_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return without_accents.strip().lower()
