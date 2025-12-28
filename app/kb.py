import io
from typing import Iterable, List


def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 200) -> List[str]:
    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        chunks.append(text[start:end].strip())
        start = end - overlap
        if start < 0:
            start = 0
        if end == length:
            break
    return [c for c in chunks if c]


def read_text_from_upload(filename: str, content: bytes) -> str:
    if filename.lower().endswith((".txt", ".md")):
        return content.decode("utf-8", errors="ignore")
    if filename.lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("pypdf is required for PDF uploads.") from exc
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    raise RuntimeError("Unsupported file type. Use .txt, .md, or .pdf")
