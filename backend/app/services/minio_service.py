from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Minio | None = None


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        _ensure_bucket(_client)
    return _client


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
    client = get_client()
    return client.presigned_get_object(settings.minio_bucket, object_name, expires=expires)


def delete_file(object_name: str):
    client = get_client()
    client.remove_object(settings.minio_bucket, object_name)
