from app.db.models.user import User
from app.db.models.department import Department
from app.db.models.role import Role, Permission
from app.db.models.knowledge_base import KnowledgeBase, KnowledgeBasePermission, UserKBOverride
from app.db.models.document import Document, DocumentVersion, DocumentProcessingTask
from app.db.models.chunk import Chunk
from app.db.models.rag_config import RAGConfig
from app.db.models.conversation import ChatSession, ChatMessage, RagAnswerSource
from app.db.models.model_config import ModelConfig
from app.db.models.audit_log import AuditLog
from app.db.models.knowledge_gap import KnowledgeGap
from app.db.models.evaluation import EvalDataset, EvalRun, EvalResult
from app.db.models.associations import user_roles, role_permissions, department_members
from app.db.session import Base

__all__ = [
    "User", "Department", "Role", "Permission",
    "KnowledgeBase", "KnowledgeBasePermission", "UserKBOverride",
    "Document", "DocumentVersion", "DocumentProcessingTask",
    "Base",
]
