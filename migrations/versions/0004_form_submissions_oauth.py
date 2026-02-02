"""form submissions and oauth credentials"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0004_form_submissions_oauth"
down_revision = "0003_kb_embedding_dim"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "form_submissions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.String(length=128), nullable=False),
        sa.Column("form_id", sa.String(length=128), nullable=False),
        sa.Column("form_name", sa.String(length=256), nullable=False),
        sa.Column("delivery_type", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("delivery_target", sa.String(length=512), nullable=True),
        sa.Column("delivery_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("delivery_result", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_form_submissions_tenant_id", "form_submissions", ["tenant_id"])
    op.create_index("ix_form_submissions_agent_id", "form_submissions", ["agent_id"])
    op.create_index("ix_form_submissions_version", "form_submissions", ["version"])
    op.create_index("ix_form_submissions_thread_id", "form_submissions", ["thread_id"])
    op.create_index("ix_form_submissions_form_id", "form_submissions", ["form_id"])
    op.create_index("ix_form_submissions_delivery_type", "form_submissions", ["delivery_type"])

    op.create_table(
        "oauth_credentials",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("token", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
        ),
    )
    op.create_unique_constraint("uq_oauth_credentials", "oauth_credentials", ["tenant_id", "agent_id", "provider"])
    op.create_index("ix_oauth_credentials_tenant_id", "oauth_credentials", ["tenant_id"])
    op.create_index("ix_oauth_credentials_agent_id", "oauth_credentials", ["agent_id"])
    op.create_index("ix_oauth_credentials_provider", "oauth_credentials", ["provider"])


def downgrade() -> None:
    op.drop_table("oauth_credentials")
    op.drop_table("form_submissions")
