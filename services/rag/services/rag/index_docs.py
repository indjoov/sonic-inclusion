from pathlib import Path

DOCS = [
    Path("README.md"),
    Path("ARCHITECTURE.md"),
    Path("docs"),
]

def load_text():
    texts = []
    for item in DOCS:
        if item.is_file():
            texts.append(item.read_text(encoding="utf-8"))
        elif item.is_dir():
            for md in item.rglob("*.md"):
                texts.append(md.read_text(encoding="utf-8"))
    return texts

def chunk_text(text, size=500):
    words = text.split()
    return [
        " ".join(words[i:i+size])
        for i in range(0, len(words), size)
    ]

if __name__ == "__main__":
    docs = load_text()
    chunks = []
    for d in docs:
        chunks.extend(chunk_text(d))

    print(f"Loaded {len(docs)} documents")
    print(f"Generated {len(chunks)} chunks")
    print("Sample chunk:\n")
    print(chunks[0][:500])
