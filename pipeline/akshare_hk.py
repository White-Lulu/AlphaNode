"""Download Hong Kong annual statements by invoking the checked-out AKShare module."""
import json
import os

from fetch import CACHE

AKSHARE_CODE = "https://github.com/akfamily/akshare/blob/f5324effb9419cba50bba423b4bd33073c79bdc2/akshare/stock/finance/stock_finance_hk_em.py"
STATEMENTS = {"income":"利润表", "balance":"资产负债表", "cash":"现金流量表"}

def cache_path(stock):
    return CACHE / f"akshare-hk-{stock}.json"

def fetch_company(stock):
    import upstream_code
    from akshare.exceptions import AkshareException
    from akshare.stock.finance.stock_finance_hk_em import (
        _get_hk_financial_report_list, stock_financial_hk_report_em,
    )

    path = cache_path(stock)
    if path.is_file() and os.getenv("INDUSTRYLAB_REFRESH") != "1":
        return stock, None
    try:
        summary = _get_hk_financial_report_list(stock)
        summary = summary[summary["REPORT_TYPE"] == "年报"]
        reports = {"annual":json.loads(summary.to_json(orient="records", force_ascii=False))}
        for key, label in STATEMENTS.items():
            table = stock_financial_hk_report_em(stock, label, "年度")
            if table.empty or not {"STD_ITEM_CODE", "AMOUNT", "REPORT_DATE"}.issubset(table.columns):
                raise ValueError(f"{key} did not return annual items")
            reports[key] = json.loads(table.to_json(orient="records", force_ascii=False, double_precision=15))
        staged = path.with_suffix(".tmp")
        staged.write_text(json.dumps(reports, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        staged.replace(path)
        return stock, None
    except (AkshareException, OSError, KeyError, ValueError, TypeError, AttributeError) as exc:
        return stock, str(exc)
