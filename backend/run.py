"""Start the API with auto-reload that ignores the data folder.

    python run.py

`uvicorn app.main:app --reload` watches the whole backend folder, so writes to the SQLite
DB / vector store / uploads can restart the server in the middle of document ingestion.
This launcher only watches the source code in ./app.
"""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "7860")),
        reload=True,
        reload_dirs=["app"],
        reload_includes=["*.py"],
        reload_excludes=["data/*", "*.db", "*.db-*"],
    )
