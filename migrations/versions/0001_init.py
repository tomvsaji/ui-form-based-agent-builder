"""init"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_drafts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_unique_constraint("uq_agent_drafts_tenant_agent", "agent_drafts", ["tenant_id", "agent_id"])
    op.create_index("ix_agent_drafts_tenant_id", "agent_drafts", ["tenant_id"])
    op.create_index("ix_agent_drafts_agent_id", "agent_drafts", ["agent_id"])

    op.create_table(
        "agent_versions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_unique_constraint(
        "uq_agent_versions",
        "agent_versions",
        ["tenant_id", "agent_id", "version"],
    )
    op.create_index("ix_agent_versions_tenant_id", "agent_versions", ["tenant_id"])
    op.create_index("ix_agent_versions_agent_id", "agent_versions", ["agent_id"])
    op.create_index("ix_agent_versions_version", "agent_versions", ["version"])

    op.create_table(
        "thread_states",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.String(length=128), nullable=False),
        sa.Column("state", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_unique_constraint(
        "uq_thread_states",
        "thread_states",
        ["tenant_id", "agent_id", "version", "thread_id"],
    )
    op.create_index("ix_thread_states_tenant_id", "thread_states", ["tenant_id"])
    op.create_index("ix_thread_states_agent_id", "thread_states", ["agent_id"])
    op.create_index("ix_thread_states_version", "thread_states", ["version"])
    op.create_index("ix_thread_states_thread_id", "thread_states", ["thread_id"])

    op.create_table(
        "chat_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("state", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_chat_logs_tenant_id", "chat_logs", ["tenant_id"])
    op.create_index("ix_chat_logs_agent_id", "chat_logs", ["agent_id"])
    op.create_index("ix_chat_logs_version", "chat_logs", ["version"])
    op.create_index("ix_chat_logs_thread_id", "chat_logs", ["thread_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("actor", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    op.create_index("ix_audit_logs_agent_id", "audit_logs", ["agent_id"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("chat_logs")
    op.drop_table("thread_states")
    op.drop_table("agent_versions")
    op.drop_table("agent_drafts")
