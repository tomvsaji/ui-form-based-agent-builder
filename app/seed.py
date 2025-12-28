from typing import Dict

from .config import CONFIG_FILES


def load_seed_config() -> Dict[str, dict]:
    data = {}
    for name, path in CONFIG_FILES.items():
        with path.open("r", encoding="utf-8") as f:
            import json

            data[name] = json.load(f)
    return data
