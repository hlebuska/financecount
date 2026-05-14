from fastapi import FastAPI
from pydantic import BaseModel
import pdfplumber

app = FastAPI()


class ParseFileRequest(BaseModel):
    filePath: str


class ParseFileResponse(BaseModel):
    text: str


@app.post("/parse", response_model=ParseFileResponse)
def parse_file(request: ParseFileRequest):
    sections: list[str] = []

    with pdfplumber.open(request.filePath) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            page_sections: list[str] = [f"--- Page {page_index} ---"]

            page_text = page.extract_text()
            if page_text:
                page_sections.append(page_text)

            tables = page.extract_tables()
            for table_index, table in enumerate(tables, start=1):
                page_sections.append(f"--- Page {page_index} Table {table_index} ---")
                for row in table:
                    cells = [cell or "" for cell in row]
                    page_sections.append(" | ".join(cells))

            sections.append("\n".join(page_sections))

    return ParseFileResponse(text="\n\n".join(sections))
