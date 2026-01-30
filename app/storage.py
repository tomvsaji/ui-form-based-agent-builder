from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import delete, desc, or_, select

from .db import session_scope
from .db_models import (
    AgentDraft,
    AgentVersion,
    AuditLog,
    ChatLog,
    KnowledgeBase,
    KnowledgeDocument,
    ThreadState,
    TraceLog,
)


DEFAULT_TENANT = "local"
DEFAULT_AGENT = "default"


def get_tenant_id() -> str:
    import os

    return os.getenv("TENANT_ID", DEFAULT_TENANT)


def get_agent_id() -> str:
    import os

    return os.getenv("AGENT_ID", DEFAULT_AGENT)


def get_draft_config(tenant_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
    with session_scope() as session:
        stmt = select(AgentDraft).where(
            AgentDraft.tenant_id == tenant_id,
            AgentDraft.agent_id == agent_id,
        )
        draft = session.execute(stmt).scalars().first()
        return draft.config if draft else None


def upsert_draft_config(tenant_id: str, agent_id: str, config: Dict[str, Any]) -> None:
    with session_scope() as session:
        stmt = select(AgentDraft).where(
            AgentDraft.tenant_id == tenant_id,
            AgentDraft.agent_id == agent_id,
        )
        draft = session.execute(stmt).scalars().first()
        if draft:
            draft.config = config
        else:
            session.add(AgentDraft(tenant_id=tenant_id, agent_id=agent_id, config=config))


def publish_config(tenant_id: str, agent_id: str, config: Dict[str, Any]) -> int:
    with session_scope() as session:
        stmt = select(AgentVersion.version).where(
            AgentVersion.tenant_id == tenant_id,
            AgentVersion.agent_id == agent_id,
        )
        max_version = session.execute(stmt.order_by(desc(AgentVersion.version))).scalars().first()
        next_version = (max_version or 0) + 1
        session.add(
            AgentVersion(
                tenant_id=tenant_id,
                agent_id=agent_id,
                version=next_version,
                config=config,
            )
        )
        session.add(
            AuditLog(
                tenant_id=tenant_id,
                agent_id=agent_id,
                actor="system",
                action="publish",
                detail={"version": next_version},
            )
        )
        return next_version


def list_versions(tenant_id: str, agent_id: str) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = (
            select(AgentVersion.version, AgentVersion.created_at)
            .where(AgentVersion.tenant_id == tenant_id, AgentVersion.agent_id == agent_id)
            .order_by(desc(AgentVersion.version))
        )
        return [
            {"version": row.version, "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in session.execute(stmt)
        ]


def get_version_config(tenant_id: str, agent_id: str, version: int) -> Optional[Dict[str, Any]]:
    with session_scope() as session:
        stmt = select(AgentVersion).where(
            AgentVersion.tenant_id == tenant_id,
            AgentVersion.agent_id == agent_id,
            AgentVersion.version == version,
        )
        found = session.execute(stmt).scalars().first()
        return found.config if found else None


def get_latest_version_payload(tenant_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
    with session_scope() as session:
        stmt = (
            select(AgentVersion)
            .where(AgentVersion.tenant_id == tenant_id, AgentVersion.agent_id == agent_id)
            .order_by(desc(AgentVersion.version))
        )
        found = session.execute(stmt).scalars().first()
        if not found:
            return None
        return {"version": found.version, "config": found.config}


def log_chat(
    tenant_id: str,
    agent_id: str,
    version: int,
    thread_id: str,
    role: str,
    content: str,
    state: Optional[Dict[str, Any]] = None,
) -> None:
    with session_scope() as session:
        session.add(
            ChatLog(
                tenant_id=tenant_id,
                agent_id=agent_id,
                version=version,
                thread_id=thread_id,
                role=role,
                content=content,
                state=state,
            )
        )


def upsert_thread_state(
    tenant_id: str,
    agent_id: str,
    version: int,
    thread_id: str,
    state: Dict[str, Any],
) -> None:
    with session_scope() as session:
        stmt = select(ThreadState).where(
            ThreadState.tenant_id == tenant_id,
            ThreadState.agent_id == agent_id,
            ThreadState.version == version,
            ThreadState.thread_id == thread_id,
        )
        found = session.execute(stmt).scalars().first()
        if found:
            found.state = state
        else:
            session.add(
                ThreadState(
                    tenant_id=tenant_id,
                    agent_id=agent_id,
                    version=version,
                    thread_id=thread_id,
                    state=state,
                )
            )


def get_thread_state(
    tenant_id: str,
    agent_id: str,
    version: int,
    thread_id: str,
) -> Optional[Dict[str, Any]]:
    with session_scope() as session:
        stmt = select(ThreadState).where(
            ThreadState.tenant_id == tenant_id,
            ThreadState.agent_id == agent_id,
            ThreadState.version == version,
            ThreadState.thread_id == thread_id,
        )
        found = session.execute(stmt).scalars().first()
        return found.state if found else None


def list_threads(tenant_id: str, agent_id: str) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = (
            select(ChatLog.thread_id, ChatLog.created_at)
            .where(ChatLog.tenant_id == tenant_id, ChatLog.agent_id == agent_id)
            .order_by(desc(ChatLog.created_at))
        )
        rows = session.execute(stmt).all()
        seen = set()
        results = []
        for thread_id, created_at in rows:
            if thread_id in seen:
                continue
            seen.add(thread_id)
            results.append(
                {"thread_id": thread_id, "last_activity": created_at.isoformat() if created_at else None}
            )
        return results


def get_thread_messages(tenant_id: str, agent_id: str, thread_id: str) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = (
            select(ChatLog.role, ChatLog.content, ChatLog.state, ChatLog.created_at)
            .where(
                ChatLog.tenant_id == tenant_id,
                ChatLog.agent_id == agent_id,
                ChatLog.thread_id == thread_id,
            )
            .order_by(ChatLog.created_at.asc())
        )
        return [
            {
                "role": row.role,
                "content": row.content,
                "state": row.state,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in session.execute(stmt)
        ]


def create_knowledge_base(tenant_id: str, name: str, description: str, provider: str) -> int:
    with session_scope() as session:
        kb = KnowledgeBase(tenant_id=tenant_id, name=name, description=description, provider=provider)
        session.add(kb)
        session.flush()
        return int(kb.id)


def list_knowledge_bases(tenant_id: str) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = select(KnowledgeBase).where(KnowledgeBase.tenant_id == tenant_id).order_by(KnowledgeBase.created_at.desc())
        return [
            {
                "id": kb.id,
                "name": kb.name,
                "description": kb.description,
                "provider": kb.provider,
                "created_at": kb.created_at.isoformat() if kb.created_at else None,
            }
            for kb in session.execute(stmt).scalars().all()
        ]


def delete_knowledge_base(tenant_id: str, kb_id: int) -> None:
    with session_scope() as session:
        session.execute(
            delete(KnowledgeDocument).where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.kb_id == kb_id,
            )
        )
        session.execute(
            delete(KnowledgeBase).where(
                KnowledgeBase.tenant_id == tenant_id,
                KnowledgeBase.id == kb_id,
            )
        )


def list_kb_files(tenant_id: str, kb_id: int) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = select(KnowledgeDocument.doc_metadata, KnowledgeDocument.created_at).where(
            KnowledgeDocument.tenant_id == tenant_id,
            KnowledgeDocument.kb_id == kb_id,
        )
        files: Dict[str, Dict[str, Any]] = {}
        for row in session.execute(stmt):
            metadata = row.doc_metadata or {}
            filename = metadata.get("filename") or "manual_entry"
            entry = files.setdefault(filename, {"filename": filename, "chunks": 0, "last_indexed_at": None})
            entry["chunks"] += 1
            created_at = row.created_at.isoformat() if row.created_at else None
            if created_at and (entry["last_indexed_at"] is None or created_at > entry["last_indexed_at"]):
                entry["last_indexed_at"] = created_at
        return sorted(files.values(), key=lambda item: item["last_indexed_at"] or "", reverse=True)


def _kb_filename_clause(filename: str):
    if filename == "manual_entry":
        return or_(
            KnowledgeDocument.doc_metadata.is_(None),
            KnowledgeDocument.doc_metadata["filename"].astext.is_(None),
        )
    return KnowledgeDocument.doc_metadata["filename"].astext == filename


def delete_kb_file(tenant_id: str, kb_id: int, filename: str) -> int:
    with session_scope() as session:
        result = session.execute(
            delete(KnowledgeDocument).where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.kb_id == kb_id,
                _kb_filename_clause(filename),
            )
        )
        return result.rowcount or 0


def list_kb_file_chunks(tenant_id: str, kb_id: int, filename: str, limit: int = 50) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = (
            select(
                KnowledgeDocument.id,
                KnowledgeDocument.content,
                KnowledgeDocument.doc_metadata,
                KnowledgeDocument.created_at,
            )
            .where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.kb_id == kb_id,
                _kb_filename_clause(filename),
            )
            .order_by(KnowledgeDocument.id.asc())
            .limit(limit)
        )
        results = []
        for row in session.execute(stmt):
            metadata = row.doc_metadata or {}
            results.append(
                {
                    "id": row.id,
                    "content": row.content,
                    "chunk_index": metadata.get("chunk_index"),
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
            )
        return results


def add_kb_document(
    tenant_id: str,
    kb_id: int,
    content: str,
    embedding: Optional[List[float]],
    metadata: Optional[Dict[str, Any]] = None,
) -> int:
    with session_scope() as session:
        doc = KnowledgeDocument(
            tenant_id=tenant_id,
            kb_id=kb_id,
            content=content,
            embedding=embedding,
            doc_metadata=metadata,
        )
        session.add(doc)
        session.flush()
        return int(doc.id)


def search_kb_documents(tenant_id: str, kb_id: int, embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = (
            select(
                KnowledgeDocument.id,
                KnowledgeDocument.content,
                KnowledgeDocument.doc_metadata,
                KnowledgeDocument.embedding.cosine_distance(embedding).label("distance"),
            )
            .where(KnowledgeDocument.tenant_id == tenant_id, KnowledgeDocument.kb_id == kb_id)
            .order_by("distance")
            .limit(limit)
        )
        return [
            {
                "id": row.id,
                "content": row.content,
                "metadata": row.doc_metadata,
                "distance": float(row.distance) if row.distance is not None else None,
            }
            for row in session.execute(stmt)
        ]


def log_trace(
    tenant_id: str,
    agent_id: str,
    version: int,
    thread_id: str,
    trace_id: str,
    data: Dict[str, Any],
) -> None:
    with session_scope() as session:
        session.add(
            TraceLog(
                tenant_id=tenant_id,
                agent_id=agent_id,
                version=version,
                thread_id=thread_id,
                trace_id=trace_id,
                data=data,
            )
        )


def list_traces(tenant_id: str, agent_id: str, thread_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with session_scope() as session:
        stmt = select(TraceLog).where(TraceLog.tenant_id == tenant_id, TraceLog.agent_id == agent_id)
        if thread_id:
            stmt = stmt.where(TraceLog.thread_id == thread_id)
        stmt = stmt.order_by(TraceLog.created_at.desc()).limit(100)
        return [
            {
                "trace_id": trace.trace_id,
                "thread_id": trace.thread_id,
                "version": trace.version,
                "data": trace.data,
                "created_at": trace.created_at.isoformat() if trace.created_at else None,
            }
            for trace in session.execute(stmt).scalars().all()
        ]
