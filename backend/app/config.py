from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    posiflora_base_url: str
    posiflora_username: str
    posiflora_password: str
    posiflora_store_id: str
    posiflora_source_id: str
    tbank_terminal_key: str
    tbank_secret_key: str
    tbank_api_url: str = "https://securepay.tinkoff.ru/v2"

    # --- Фискализация aQsi (54-ФЗ). Пусто = выключена (dev/тесты). ---
    aqsi_api_key: str | None = None
    # id кассы из GET /pub/v4/Devices (смарт-терминал aQsi 5Ф магазина).
    aqsi_device_id: int | None = None
    aqsi_api_url: str = "https://api.aqsi.ru/pub"
    # Тег 1055 «система налогообложения»: 2 = УСН доход (наш режим по умолчанию).
    aqsi_tax_system_code: int = 2
    # Тег ставки НДС aQsi VATRateEnum: 6 = НДС не облагается (УСН).
    aqsi_vat_rate_id: int = 6
    frontend_url: str = "http://localhost:3000"

    # --- Auth (/v1/sessions) ---
    jwt_secret: str  # required — HS256 signing key for access tokens
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 3600  # 1 hour
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30  # 30 days
    # Refresh tokens live in Redis when set; otherwise an in-process store is
    # used (dev/tests only — not safe across workers/restarts).
    redis_url: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
