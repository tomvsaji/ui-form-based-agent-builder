from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select

from .db import session_scope
from .db_models import AgentDraft, AgentVersion, AuditLog, ChatLog, ThreadState


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
