"""Relax knowledge document embedding dimension."""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0003_kb_embedding_dim"
down_revision = "0002_kb_traces"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE knowledge_documents ALTER COLUMN embedding TYPE vector")


def downgrade() -> None:
    op.execute("ALTER TABLE knowledge_documents ALTER COLUMN embedding TYPE vector(1536)")
