from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://raguser:ragpassword@localhost:5432/ragsystem"
    database_url_sync: str = "postgresql://raguser:ragpassword@localhost:5432/ragsystem"

    # Database connection pool
    db_pool_size: int = 5                    # 每 worker 持久连接数
    db_max_overflow: int = 10                # 峰值额外连接数
    db_pool_recycle: int = 3600              # 连接回收时间（秒）

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
    minio_region: str = "us-east-1"
    minio_public_endpoint: str = "localhost:9000"

    # JWT — must be set via JWT_SECRET_KEY env var
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120

    # LLM
    llm_provider: str = "openai"        # openai / deepseek / claude / qwen / openai-compatible
    llm_api_key: str = ""
    llm_api_base: str = ""              # 可选，自定义 API 地址
    llm_model_name: str = "gpt-4o"
    llm_temperature: float = 0.1

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Cache TTL (seconds)
    retrieval_cache_ttl: int = 300       # 检索结果缓存 5 分钟
    embedding_cache_ttl: int = 604800    # Embedding 缓存 7 天
    llm_config_cache_ttl: int = 60       # LLM DB 配置缓存 60 秒

    # Rate limiting
    rag_rate_limit_per_minute: int = 30        # RAG 查询每用户每分钟限制

    # Request size
    max_request_body_size: int = 10 * 1024 * 1024  # 10MB 全局请求体大小限制

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": "../.env", "extra": "allow"}


settings = Settings()
