import logging
from typing import Any, Dict

from .models import PersistenceConfig

logger = logging.getLogger(__name__)


class ThreadStore:
    """Optional Cosmos DB persistence for chat threads."""

    def __init__(self, config: PersistenceConfig):
        self.config = config
        self.enabled = (
            config.enable_cosmos
            and config.cosmos_account_uri is not None
            and (config.cosmos_key is not None or config.use_managed_identity)
        )
        self.container = None
        if self.enabled:
            self._init_cosmos()

    def _init_cosmos(self) -> None:
        try:
            from azure.cosmos import CosmosClient, PartitionKey
            from azure.identity import DefaultAzureCredential

            if self.config.use_managed_identity:
                credential = DefaultAzureCredential()
                client = CosmosClient(self.config.cosmos_account_uri, credential=credential)
            else:
                client = CosmosClient(self.config.cosmos_account_uri, self.config.cosmos_key)

            database = client.create_database_if_not_exists(id=self.config.database)
            self.container = database.create_container_if_not_exists(
                id=self.config.container,
                partition_key=PartitionKey(path=self.config.partition_key or "/thread_id"),
            )
            logger.info("Cosmos DB container ready for persistence.")
        except Exception as exc:  # pragma: no cover - best-effort initialization
            logger.warning("Cosmos DB initialization failed: %s", exc)
            self.enabled = False

    def persist_state(self, thread_id: str, state: Dict[str, Any]) -> None:
        if not self.enabled or not self.container:
            return
        try:
            doc = {"id": thread_id, "thread_id": thread_id, "state": state}
            self.container.upsert_item(doc)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to persist state to Cosmos DB: %s", exc)
