"""Maintain the workbench's issuer-level economic-function classification."""
from collections import Counter, defaultdict

from fetch import ROOT

CONFIG = ROOT / "config"
DATASET = "economic-functions"
VERSION = 1


def lines(filename):
    return [
        line for line in (CONFIG / filename).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def read_classification(isic_nodes):
    taxonomy, path = {}, []
    for line in lines("economic-functions.txt"):
        indent = len(line) - len(line.lstrip())
        level = indent // 2 + 1
        code, name, english = (field.strip() for field in line.split("|"))
        if indent % 2 or not 1 <= level <= 3 or level > len(path) + 1 or code in taxonomy:
            raise ValueError(f"Invalid economic-function category: {line}")
        path = path[:level - 1]
        taxonomy[code] = {
            "id": code, "name": name, "en": english, "level": level,
            "parent": path[-1] if path else None,
        }
        path.append(code)
    leaves = {code for code, node in taxonomy.items() if node["level"] == 3}
    defaults, overrides = {}, {}
    for file, target in (("economic-function-defaults.txt", defaults),
                         ("economic-function-overrides.txt", overrides)):
        for line in lines(file):
            leaf, keys, *note = (field.strip() for field in line.split("|"))
            if leaf not in leaves or len(note) not in (0, 2):
                raise ValueError(f"Invalid economic-function mapping: {line}")
            for token in keys.split():
                key = token.split("=", 1)[0]
                if key in target or (target is defaults and key not in isic_nodes):
                    raise ValueError(f"Duplicate or unknown classification key: {key}")
                target[key] = {"group": leaf, **({"note": note} if note else {})}
    for code, node in isic_nodes.items():
        if node["level"] == 3 and code not in defaults and node["parent"] not in defaults:
            raise ValueError(f"Missing economic-function mapping for ISIC {code}")
    return taxonomy, defaults, overrides


def assign(companies, isic_nodes):
    taxonomy, defaults, overrides = read_classification(isic_nodes)
    by_id = {company["id"]: company for company in companies}
    preferred, configured = {}, set()
    for line in lines("economic-function-listings.txt"):
        ids = [token.split("=", 1)[0] for token in line.split()]
        if len(ids) < 2 or len(ids) != len(set(ids)) or configured.intersection(ids):
            raise ValueError(f"Invalid linked issuer records: {line}")
        configured.update(ids)
        active = [issuer_id for issuer_id in ids if issuer_id in by_id]
        for issuer_id in active[1:]:
            preferred[issuer_id] = active[0]
    canonical = [company for company in companies if company["id"] not in preferred]
    assignments = {}
    for company in canonical:
        issuer_id, isic = company["id"], company["parent"]
        if issuer_id in overrides:
            basis, mapping = "issuer", overrides[issuer_id]
        elif isic in defaults:
            basis, mapping = "isic_group", defaults[isic]
        else:
            basis, mapping = "isic_division", defaults[isic_nodes[isic]["parent"]]
        assignments[issuer_id] = {"basis": basis, **mapping}
    for alias, issuer_id in preferred.items():
        assignments[alias] = {**assignments[issuer_id], "canonical": issuer_id}
    members = defaultdict(list)
    for company in canonical:
        group = assignments[company["id"]]["group"]
        while group:
            members[group].append(company)
            group = taxonomy[group]["parent"]
    coverage = {
        "records": len(companies),
        "issuers": len(canonical),
        "byBasis": dict(Counter(assignments[c["id"]]["basis"] for c in canonical)),
        "groups": sum(taxonomy[code]["level"] == 3 for code in members),
        "byRoot": {code: len(members.get(code, ())) for code, node in taxonomy.items() if node["level"] == 1},
    }
    return taxonomy, assignments, members, coverage
