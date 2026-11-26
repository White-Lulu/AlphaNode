"""Financial ingestion checks; run with python -m unittest discover -s tests."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import macro_atlas as atlas
import macro_supplement as supplement


class MacroSupplementTests(unittest.TestCase):
    def test_quarter_growth_is_percent_not_annualized(self):
        # OECD KEI USA 2024-Q1 G1 observation, in percentage units.
        body = b"REF_AREA,FREQ,MEASURE,UNIT_MEASURE,ACTIVITY,ADJUSTMENT,TRANSFORMATION,TIME_PERIOD,OBS_VALUE,UNIT_MULT,OBS_STATUS\nUSA,Q,B1GQ_Q,GR,_T,Y,G1,2024-Q1,0.359154700270414,0,P\n"
        with patch.object(supplement, "OECD", [supplement.OECD[0]]):
            result = supplement.build_oecd([{"id": "USA"}], lambda *a, **k: body, atlas.set_value)
        row = result["gdpQuarterGrowth"]["rows"][0]
        self.assertAlmostEqual(row["values"]["2024-Q1"], 0.00359154700270414)
        self.assertEqual(row["flags"]["2024-Q1"], "P")

    def test_imf_display_scale_does_not_multiply_usd(self):
        body = b"COUNTRY,BOP_ACCOUNTING_ENTRY,INDICATOR,UNIT,FREQUENCY,TIME_PERIOD,OBS_VALUE,SCALE\nUSA,NETAL_P,NIIP,USD,Q,2024-Q1,-18385692000000,6\nUSA,NETAL_P,NIIP,USD,A,2024,-20000000000000,6\n"
        result = supplement.build_iip([{"id": "USA"}], lambda *a, **k: body, atlas.set_value)
        self.assertEqual(result["niip"]["rows"][0]["values"], {"2024-Q1": -18385692000000.0})
        self.assertEqual(result["niipAnnual"]["rows"][0]["values"], {"2024": -20000000000000.0})

    def test_benchmark_mean_preserves_negative_quotes_and_missing_days(self):
        body = b"observation_date,DCOILBRENTEU,DCOILWTICO,DHHNGSP\n2020-04-01,20,11,2\n2020-04-20,18,-37,1\n2020-04-21,,,\n"
        result = supplement.build_costs(lambda *a, **k: body, atlas.set_value)
        row = result["wti"]["rows"][0]
        self.assertEqual(row["economy"], "WLD")
        self.assertEqual(row["values"], {"2020-04": -13.0})
        self.assertEqual(result["henryHub"]["rows"][0]["values"], {"2020-04": 1.5})

    def test_spread_matches_common_months_and_percentage_point_storage(self):
        result = atlas.build_derived({
            "usTreasury10": {"rows": [{"economy": "USA", "values": {"2024-01": 0.04, "2024-02": 0.05}}]},
            "usTreasury2": {"rows": [{"economy": "USA", "values": {"2024-01": 0.045}}]},
        })["usYieldSlope"]
        self.assertEqual(result["unit"], "pp")
        self.assertEqual(list(result["rows"][0]["values"]), ["2024-01"])
        self.assertAlmostEqual(result["rows"][0]["values"]["2024-01"], -0.005)
        rows = {}
        atlas.set_value(rows, "USA", "2024", 1.5, "pp")
        self.assertEqual(rows["USA"]["values"]["2024"], 0.015)

    def test_conflicting_observations_are_rejected(self):
        rows = {}
        supplement.record_value(rows, "USA", "2024", 2, "pct", atlas.set_value)
        with self.assertRaises(ValueError):
            supplement.record_value(rows, "USA", "2024", 3, "pct", atlas.set_value)


if __name__ == "__main__":
    unittest.main()
