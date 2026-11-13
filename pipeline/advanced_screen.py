"""Run Crible's source parser/compiler against the local annual financial panel."""
from pathlib import Path
import re

import duckdb

import upstream_code
from crible.dsl.compiler import compile_query
from crible.dsl.parser import DslError, parse

DATABASE = Path(__file__).resolve().parents[1] / "warehouse/industrylab.duckdb"
TEXT_FIELDS = {"ticker", "economy", "isic", "provider"}
IDENTIFIER = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")

def execute_screen(expression, year):
    if not DATABASE.is_file():
        raise FileNotFoundError(DATABASE)
    with duckdb.connect(str(DATABASE), read_only=True, config={"enable_external_access": "false", "threads": "2"}) as conn:
        numeric = {row[0] for row in conn.execute("SELECT DISTINCT metric FROM issuer_metric").fetchall()}
        numeric = {field for field in numeric if IDENTIFIER.fullmatch(field)}
        kinds = {field: "number" for field in numeric}
        kinds.update(dict.fromkeys(TEXT_FIELDS, "string"))
        predicate, parameters = compile_query(parse(expression), set(kinds), kinds)
        fields = ", ".join(f'MAX(value) FILTER (WHERE metric = \'{field}\') AS "{field}"' for field in sorted(numeric))
        statement = f"""
            WITH annual AS (
                SELECT issuer_id, {fields} FROM issuer_metric WHERE fiscal_year = ?
                GROUP BY issuer_id
            )
            SELECT i.id FROM issuer AS i LEFT JOIN annual AS a ON i.id = a.issuer_id
            WHERE {predicate}
            ORDER BY i.id
        """
        return [row[0] for row in conn.execute(statement, [year, *parameters]).fetchall()]
