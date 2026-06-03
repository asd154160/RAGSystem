"""日志配置 — stdout + 文件持久化（RotatingFileHandler）"""
import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR = os.environ.get("LOG_DIR", "/app/logs")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def setup_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))

    # stdout — Docker logs
    console = logging.StreamHandler()
    console.setFormatter(_fmt)
    root.addHandler(console)

    # 全量日志文件（10MB x 10 = 100MB）
    app_file = RotatingFileHandler(
        os.path.join(LOG_DIR, "app.log"), maxBytes=10 * 1024 * 1024, backupCount=10
    )
    app_file.setFormatter(_fmt)
    root.addHandler(app_file)

    # 错误日志单独文件（10MB x 5 = 50MB）
    err_file = RotatingFileHandler(
        os.path.join(LOG_DIR, "error.log"), maxBytes=10 * 1024 * 1024, backupCount=5
    )
    err_file.setLevel(logging.ERROR)
    err_file.setFormatter(_fmt)
    root.addHandler(err_file)

    # 第三方库降噪
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("pymilvus").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
