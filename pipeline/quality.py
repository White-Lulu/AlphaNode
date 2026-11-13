"""Financial-statement models from the local Crible and FinanceToolkit source trees."""
import math

import pandas as pd

import upstream_code
from crible.compute.scores import altman, zmijewski
from financetoolkit.models.dupont_model import get_dupont_analysis

MODEL_METRICS = {
    "equityMultiplier": ("杜邦权益乘数", "ratio"),
    "dupontRoe": ("杜邦 ROE", "pct"),
    "altmanZ2": ("Altman Z″", "score"),
    "zmijewski": ("Zmijewski X", "score"),
}
TOOLKIT = "https://github.com/JerBouma/FinanceToolkit/blob/375f820d8f84e90e2f42f5d413ed67056cbd4256/financetoolkit/models/dupont_model.py"
CRIBLE = "https://github.com/maxgfr/crible/blob/6a3e9ca95e023409a2eac88c6c5fbb1e718092f0/src/crible/compute/scores.py"
INPUTS = {
    "net": "net_income", "revenue": "revenue", "assets": "total_assets",
    "assets_avg": "average_assets", "equity_avg": "average_equity",
    "equity_total": "total_equity", "liabilities": "total_liabilities",
    "current_assets": "current_assets", "current_liab": "current_liabilities",
    "retained_earnings": "retained_earnings", "ebit": "earnings_before_interest_and_taxes",
}

def append_models(raw, metrics, is_finance):
    if is_finance or not raw:
        return
    frame = pd.DataFrame.from_dict({
        year: {column: row["facts"].get(key, [None])[0] for key, column in INPUTS.items()}
        for year, row in raw.items()
    }, orient="index", dtype=float)
    for field in ("revenue", "total_assets", "average_assets", "average_equity", "current_liabilities", "total_liabilities"):
        frame[field] = frame[field].where(frame[field] > 0)
    frame["working_capital"] = frame["current_assets"] - frame["current_liabilities"]

    dupont = get_dupont_analysis(frame["net_income"], frame["revenue"], frame["average_assets"], frame["average_equity"])
    scores = altman(frame)["altman_z_double_prime"]
    distress = zmijewski(frame)["zmijewski_score"]

    def publish(year, key, value, source, terms):
        if not math.isfinite(value):
            return
        if key in ("equityMultiplier", "dupontRoe") and not math.isfinite(dupont.loc["Return on Equity", year]):
            return
        metrics.setdefault(year, {})[key] = float(f"{value:.11g}")
        model = raw[year].setdefault("models", {})
        model[key] = {"code": source, "components": {name: float(part) for name, part in terms.items()}}

    for year, row in frame.iterrows():
        d = dupont[year]
        components = {key: d[key] for key in ("Net Profit Margin", "Asset Turnover", "Equity Multiplier")}
        publish(year, "dupontRoe", d["Return on Equity"], TOOLKIT, components)
        publish(year, "equityMultiplier", d["Equity Multiplier"], TOOLKIT, {})
        if math.isfinite(scores.at[year]):
            publish(year, "altmanZ2", scores.at[year], CRIBLE, {
                "Working capital / assets": row["working_capital"] / row["total_assets"],
                "Retained earnings / assets": row["retained_earnings"] / row["total_assets"],
                "Operating profit / assets": row["earnings_before_interest_and_taxes"] / row["total_assets"],
                "Book equity / liabilities": row["total_equity"] / row["total_liabilities"],
            })
        if math.isfinite(distress.at[year]):
            publish(year, "zmijewski", distress.at[year], CRIBLE, {
                "Net income / assets": row["net_income"] / row["total_assets"],
                "Liabilities / assets": row["total_liabilities"] / row["total_assets"],
                "Current ratio": row["current_assets"] / row["current_liabilities"],
            })
