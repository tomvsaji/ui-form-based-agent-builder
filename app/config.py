import json
from pathlib import Path
from typing import Dict, Tuple

from .models import (
    FormsConfig,
    LoggingConfig,
    PersistenceConfig,
    ProjectConfig,
    ToolsConfig,
)

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
CONFIG_FILES: Dict[str, Path] = {
    "project": CONFIG_DIR / "project.json",
    "forms": CONFIG_DIR / "forms.json",
    "tools": CONFIG_DIR / "tools.json",
    "persistence": CONFIG_DIR / "persistence.json",
    "logging": CONFIG_DIR / "logging.json",
}


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_configs() -> Tuple[ProjectConfig, FormsConfig, ToolsConfig, PersistenceConfig, LoggingConfig]:
    project = ProjectConfig.model_validate(_load_json(CONFIG_FILES["project"]))
    forms = FormsConfig.model_validate(_load_json(CONFIG_FILES["forms"]))
    tools = ToolsConfig.model_validate(_load_json(CONFIG_FILES["tools"]))
    persistence = PersistenceConfig.model_validate(_load_json(CONFIG_FILES["persistence"]))
    logging_cfg = LoggingConfig.model_validate(_load_json(CONFIG_FILES["logging"]))
    return project, forms, tools, persistence, logging_cfg


def write_config(name: str, data: dict) -> None:
    path = CONFIG_FILES.get(name)
    if not path:
        raise ValueError(f"Unknown config '{name}'")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
