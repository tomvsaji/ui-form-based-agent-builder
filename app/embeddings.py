import os
from typing import List

from openai import OpenAI


def embed_text(text: str) -> List[float]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required to embed content.")
    model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    client = OpenAI(api_key=api_key)
    response = client.embeddings.create(model=model, input=text)
    return list(response.data[0].embedding)
