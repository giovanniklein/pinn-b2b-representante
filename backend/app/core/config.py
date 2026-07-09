from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings


# Diretório raiz do monorepo atual (pasta `portal b2b/`).
# Estrutura esperada:
#   portal b2b/
#       .env                <- arquivo de ambiente compartilhado (Mongo, JWT, CORS)
#       pinn-b2b-atacadista/
#       pinn-b2b-representante/
#           backend/
#           frontend/
#
# A partir deste arquivo, subir 4 níveis:
#   core -> app -> backend -> pinn-b2b-representante -> portal b2b
REPO_ROOT_DIR = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Estas configurações controlam conexão com MongoDB, JWT, CORS
    e demais opções globais. O app do representante compartilha o mesmo
    MongoDB e configurações básicas do monorepo (.env em `portal b2b/`).
    """

    app_name: str = "KIPI Venda Mais API"
    env: str = Field(default="dev", alias="ENV")

    # MongoDB
    mongodb_uri: str | None = Field(default=None, alias="MONGODB_URI")

    mongodb_username: str | None = Field(default=None, alias="MONGODB_USERNAME")
    mongodb_password: str | None = Field(default=None, alias="MONGODB_PASSWORD")
    mongodb_host: str = Field(default="procureai.e4otgla.mongodb.net", alias="MONGODB_HOST")
    mongodb_app_name: str = Field(default="ProcureAI", alias="MONGODB_APP_NAME")
    mongodb_database: str = Field(default="pinn_b2b", alias="MONGODB_DATABASE")

    # JWT
    jwt_secret_key: str = Field(
        default="change-me-in-prod",
        alias="JWT_SECRET_KEY",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    refresh_token_expire_minutes: int = Field(
        default=60 * 24 * 7, alias="REFRESH_TOKEN_EXPIRE_MINUTES"  # 7 days
    )

    # Plano VendeMais - comissão única sobre as vendas (sem split).
    # Default usado quando o ADM ainda não configurou. Admin edita em /configuracoes.
    comissao_venda_mais: float = Field(default=0.04499, alias="COMISSAO_VENDA_MAIS")
    comissao_padrao: float = Field(default=0.0196, alias="COMISSAO_PADRAO")

    # CORS
    cors_allowed_origins: List[str] = Field(
        default_factory=lambda: ["*"], alias="CORS_ALLOWED_ORIGINS"
    )
    # Libera automaticamente qualquer subdomínio de kipi.com.br (cliente, adm,
    # parceiros...) além das origens explícitas configuradas por env.
    cors_allowed_origin_regex: str | None = Field(
        default=r"https://([a-z0-9-]+\.)*kipi\.com\.br",
        alias="CORS_ALLOWED_ORIGIN_REGEX",
    )

    class Config:
        # Usa o `.env` do app representante (caminho absoluto informado).
        env_file = r"C:\p_projetos\pinn\portal b2b\pinn-b2b-representante\.env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @property
    def resolved_mongodb_uri(self) -> str:
        """Retorna a URI efetiva do MongoDB.

        Prioridade:
        1) MONGODB_URI (completo)
        2) Monta URI a partir de MONGODB_USERNAME/MONGODB_PASSWORD
        """

        if self.mongodb_uri:
            return self.mongodb_uri

        if not self.mongodb_username or not self.mongodb_password:
            raise ValueError(
                "Configure MONGODB_URI ou MONGODB_USERNAME/MONGODB_PASSWORD no .env"
            )

        return (
            f"mongodb+srv://{self.mongodb_username}:{self.mongodb_password}"
            f"@{self.mongodb_host}/{self.mongodb_database}?retryWrites=true&w=majority"
            f"&appName={self.mongodb_app_name}"
        )


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance.

    Using lru_cache avoids re-parsing environment variables multiple times.
    """

    return Settings()  # type: ignore[call-arg]
