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
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
