from datetime import timedelta

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Minio | None = None
_public_client: Minio | None = None


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            region=settings.minio_region,
        )
        _ensure_bucket(_client)
    return _client


def _get_public_client() -> Minio:
    """返回使用公开端点配置的 MinIO 客户端，用于生成浏览器可访问的 presigned URL。"""
    global _public_client
    if _public_client is None:
        _public_client = Minio(
            settings.minio_public_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            region=settings.minio_region,
        )
    return _public_client


def _ensure_bucket(client: Minio):
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


from io import BytesIO


def upload_file(object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    client = get_client()
    client.put_object(
        settings.minio_bucket, object_name,
        data=BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_name


def get_file(object_name: str) -> bytes:
    client = get_client()
    response = None
    try:
        response = client.get_object(settings.minio_bucket, object_name)
        return response.read()
    finally:
        if response is not None:
            response.close()
            response.release_conn()


def get_presigned_url(object_name: str, expires: int = 3600) -> str:
    client = _get_public_client()
    return client.presigned_get_object(settings.minio_bucket, object_name, expires=timedelta(seconds=expires))


def delete_file(object_name: str):
    client = get_client()
    client.remove_object(settings.minio_bucket, object_name)
