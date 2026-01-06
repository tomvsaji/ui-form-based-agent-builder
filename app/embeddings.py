import os
from typing import List

from openai import OpenAI, AzureOpenAI


def embed_text(text: str) -> List[float]:
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    if azure_endpoint and azure_key:
        client = AzureOpenAI(
            api_key=azure_key,
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21"),
            azure_endpoint=azure_endpoint,
        )
        model = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
        if not model:
            raise RuntimeError("AZURE_OPENAI_EMBEDDING_DEPLOYMENT is required for embeddings.")
    else:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY or AZURE_OPENAI_API_KEY is required to embed content.")
        model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        client = OpenAI(api_key=api_key)
    response = client.embeddings.create(model=model, input=text)
    return list(response.data[0].embedding)
