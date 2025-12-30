# Third-Party Notices

This product includes software developed by third parties. The following open source components may be used by this repository (direct dependencies and common transitive dependencies).

**Important:** If you distribute this software (source or binary) to customers, you are responsible for complying with the licenses of these components, including preserving copyright and license notices.

## Direct dependencies (from `requirements.txt`)

- **FastAPI** — MIT License  
  Project: `https://github.com/fastapi/fastapi`

- **Uvicorn** — BSD-3-Clause License  
  Project: `https://github.com/encode/uvicorn`

- **SQLAlchemy** — MIT License  
  Project: `https://github.com/sqlalchemy/sqlalchemy`

- **psycopg2-binary** — LGPL with OpenSSL exception (see project for details)  
  Project: `https://www.psycopg.org/`

- **Alembic** — MIT License  
  Project: `https://github.com/sqlalchemy/alembic`

- **Pydantic** — MIT License  
  Project: `https://github.com/pydantic/pydantic`

- **pydantic-settings** — MIT License  
  Project: `https://github.com/pydantic/pydantic-settings`

- **python-dotenv** — BSD-3-Clause License  
  Project: `https://github.com/theskumar/python-dotenv`

- **python-multipart** — Apache-2.0 License  
  Project: `https://github.com/andrew-d/python-multipart`

## Transitive dependencies

This project will also install transitive dependencies (e.g., Starlette, AnyIO, Click, H11, etc.). Their licenses may impose additional notice requirements.

## How to generate a complete, accurate notice list

In a clean virtualenv, you can generate a full dependency/license report:

```bash
pip install -r requirements.txt
pip install pip-licenses
pip-licenses --format=markdown --with-urls --with-license-file --output-file THIRD_PARTY_NOTICES.generated.md
```

If you distribute the software, include the resulting notice file (and any required license texts) alongside your product distribution.


