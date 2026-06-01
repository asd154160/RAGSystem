from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://raguser:ragpassword@localhost:5432/ragsystem"
    database_url_sync: str = "postgresql://raguser:ragpassword@localhost:5432/ragsystem"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Milvus
    milvus_host: str = "localhost"
    milvus_port: int = 19530

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin123"
    minio_bucket: str = "rag-documents"
    minio_secure: bool = False

    # JWT — must be set via JWT_SECRET_KEY env var
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # LLM
    llm_provider: str = "openai"        # openai / deepseek / claude / qwen / openai-compatible
    llm_api_key: str = ""
    llm_api_base: str = ""              # 可选，自定义 API 地址
    llm_model_name: str = "gpt-4o"
    llm_temperature: float = 0.1

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": "../.env", "extra": "allow"}


settings = Settings()
