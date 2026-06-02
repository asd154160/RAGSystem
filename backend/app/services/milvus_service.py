"""
Milvus 向量数据库服务
Collection: rag_chunks — 存储 chunk embedding + metadata
"""
import time
import logging

from pymilvus import (
    connections, Collection, CollectionSchema, FieldSchema, DataType,
    utility,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "rag_chunks"
DIM = 1024  # bge-m3 dimension
REQUIRED_FIELDS = {"id", "chunk_id", "document_id", "knowledge_base_id", "parent_chunk_id",
                   "chunk_index", "embedding", "chunk_text", "section_title"}

_connected = False


def connect():
    global _connected
    if _connected:
        return
    for attempt in range(5):
        try:
            connections.connect(
                alias="default",
                host=settings.milvus_host,
                port=settings.milvus_port,
                timeout=10,
            )
            _connected = True
            logger.info(f"Connected to Milvus at {settings.milvus_host}:{settings.milvus_port}")
            return
        except Exception as e:
            logger.warning(f"Milvus connection attempt {attempt+1}/5: {e}")
            time.sleep(3)
    raise RuntimeError("Failed to connect to Milvus")


def get_collection() -> Collection:
    connect()
    if not utility.has_collection(COLLECTION_NAME):
        _create_collection()
    else:
        col = Collection(COLLECTION_NAME)
        existing_fields = {f.name for f in col.schema.fields}
        if not REQUIRED_FIELDS.issubset(existing_fields):
            logger.info(f"Milvus schema changed, dropping old collection '{COLLECTION_NAME}'...")
            col.release()
            utility.drop_collection(COLLECTION_NAME)
            _create_collection()
            col = Collection(COLLECTION_NAME)
        col.load()
        return col

    col = Collection(COLLECTION_NAME)
    col.load()
    return col


def _create_collection():
    fields = [
        FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=100, is_primary=True),
        FieldSchema(name="chunk_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="knowledge_base_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="parent_chunk_id", dtype=DataType.VARCHAR, max_length=100),
        FieldSchema(name="chunk_index", dtype=DataType.INT64),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=DIM),
        FieldSchema(name="chunk_text", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="section_title", dtype=DataType.VARCHAR, max_length=500),
    ]
    schema = CollectionSchema(fields, description="RAG Chunks Collection")
    col = Collection(COLLECTION_NAME, schema)

    index_params = {
        "metric_type": "COSINE",
        "index_type": "IVF_FLAT",
        "params": {"nlist": 128},
    }
    col.create_index("embedding", index_params)
    logger.info(f"Created Milvus collection '{COLLECTION_NAME}' with index")
    col.load()


def insert_chunks(chunks_data: list[dict]) -> list[str]:
    """批量插入向量到 Milvus，返回 vector_ids"""
    col = get_collection()
    if not chunks_data:
        return []

    ids = [d["id"] for d in chunks_data]
    entities = [
        ids,
        [d["chunk_id"] for d in chunks_data],
        [d["document_id"] for d in chunks_data],
        [d.get("knowledge_base_id", "") for d in chunks_data],
        [d.get("parent_chunk_id", "") for d in chunks_data],
        [d.get("chunk_index", 0) for d in chunks_data],
        [d["embedding"] for d in chunks_data],
        [d.get("chunk_text", "")[:65535] for d in chunks_data],
        [d.get("section_title", "")[:500] for d in chunks_data],
    ]
    col.insert(entities)
    col.flush()
    return ids


def delete_by_document_id(document_id: str) -> int:
    """按 document_id 删除向量，返回删除数量"""
    if not utility.has_collection(COLLECTION_NAME):
        return 0
    col = Collection(COLLECTION_NAME)
    col.load()
    expr = f'document_id == "{document_id}"'
    result = col.delete(expr)
    col.flush()
    count = result.delete_count if hasattr(result, 'delete_count') else 0
    logger.info(f"Deleted {count} vectors for document {document_id}")
    return count


def get_vectors_by_document_id(document_id: str) -> list[dict]:
    """获取某文档在 Milvus 中的所有向量 (chunk_id + embedding)，用于复用旧 embedding"""
    col = get_collection()
    try:
        results = col.query(
            expr=f'document_id == "{document_id}"',
            output_fields=["chunk_id", "embedding"],
        )
        return results
    except Exception as e:
        logger.warning(f"Failed to query vectors for document {document_id}: {e}")
        return []


def search(
    query_embedding: list[float],
    top_k: int = 10,
    knowledge_base_ids: list[str] | None = None,
) -> list[dict]:
    """向量检索，支持知识库过滤"""
    col = get_collection()
    search_params = {"metric_type": "COSINE", "params": {"nprobe": 16}}

    expr = None
    if knowledge_base_ids:
        kb_list = ', '.join(f'"{kid}"' for kid in knowledge_base_ids)
        expr = f"knowledge_base_id in [{kb_list}]"

    results = col.search(
        data=[query_embedding],
        anns_field="embedding",
        param=search_params,
        limit=top_k,
        expr=expr,
        output_fields=["chunk_id", "document_id", "knowledge_base_id", "parent_chunk_id",
                       "chunk_index", "chunk_text", "section_title"],
    )

    hits = []
    for hits_batch in results:
        for hit in hits_batch:
            hits.append({
                "chunk_id": hit.entity.get("chunk_id"),
                "document_id": hit.entity.get("document_id"),
                "knowledge_base_id": hit.entity.get("knowledge_base_id"),
                "parent_chunk_id": hit.entity.get("parent_chunk_id"),
                "chunk_index": hit.entity.get("chunk_index"),
                "chunk_text": hit.entity.get("chunk_text"),
                "section_title": hit.entity.get("section_title"),
                "score": float(hit.distance),
            })
    return hits
