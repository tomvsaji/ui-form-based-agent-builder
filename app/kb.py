import io
from typing import List


def chunk_text(
    text: str,
    chunk_size: int = 1200,
    overlap: int = 200,
    separators: List[str] | None = None,
) -> List[str]:
    if not text:
        return []
    splitters = separators or ["\n\n", "\n", " ", ""]
    parts = _recursive_split(text, splitters, chunk_size)
    return _merge_with_overlap(parts, chunk_size, overlap)


def _recursive_split(text: str, separators: List[str], chunk_size: int) -> List[str]:
    if not separators:
        return [text]
    sep = separators[0]
    if sep:
        splits = text.split(sep)
    else:
        splits = list(text)
    if len(separators) == 1:
        return splits

    results: List[str] = []
    for chunk in splits:
        if len(chunk) > chunk_size:
            results.extend(_recursive_split(chunk, separators[1:], chunk_size))
        else:
            results.append(chunk)
    return results


def _merge_with_overlap(parts: List[str], chunk_size: int, overlap: int) -> List[str]:
    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for part in parts:
        segment = part.strip()
        if not segment:
            continue
        projected = current_len + len(segment) + (1 if current else 0)
        if projected <= chunk_size:
            current.append(segment)
            current_len = projected
            continue
        if current:
            chunk = " ".join(current).strip()
            if chunk:
                chunks.append(chunk)
            if overlap > 0:
                overlap_text = chunk[-overlap:] if chunk else ""
                current = [overlap_text, segment] if overlap_text else [segment]
                current_len = len(overlap_text) + (1 if overlap_text else 0) + len(segment)
            else:
                current = [segment]
                current_len = len(segment)
        else:
            chunks.append(segment[:chunk_size].strip())
            remainder = segment[chunk_size:].strip()
            if remainder:
                current = [remainder]
                current_len = len(remainder)
            else:
                current = []
                current_len = 0

    if current:
        final_chunk = " ".join(current).strip()
        if final_chunk:
            chunks.append(final_chunk)
    return chunks


def read_text_from_upload(filename: str, content: bytes) -> str:
    if filename.lower().endswith((".txt", ".md")):
        return content.decode("utf-8", errors="ignore").replace("\x00", "")
    if filename.lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("pypdf is required for PDF uploads.") from exc
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return text.replace("\x00", "")
    raise RuntimeError("Unsupported file type. Use .txt, .md, or .pdf")
