
"""Collect public issuer profiles and cache selected official site icons."""
from functools import lru_cache
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
import json
import re
import shutil

import requests

from fetch import CACHE, ROOT, cached_file, catalog, get_json, read_cached, run_jobs
from xbrl import esef_catalog

CHINA = "https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax"
HK = "https://emweb.securities.eastmoney.com/PC_HKF10/CompanyProfile/PageAjax"
GLEIF = "https://api.gleif.org/api/v1/lei-records/"
SEC = "https://data.sec.gov/submissions/"
DIRECTORY = "https://github.com/JerBouma/FinanceDatabase/tree/1ac8809da4801a717541a92bb00278d4d444e240"
IMAGE_TYPES = {"image/x-icon":"ico", "image/vnd.microsoft.icon":"ico", "image/png":"png",
               "image/jpeg":"jpg", "image/webp":"webp"}
CJK = re.compile(r"[\u4e00-\u9fff]")

def curated_profiles():
    out = {}
    for line in (ROOT/"config/company-profiles.txt").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            code, website, description = line.split("|", 2)
            out[code] = {"website":website, **({"description":description} if description else {})}
    return out

def profile_url(company):
    provider = company["provider"]
    if provider == "sec":
        return f"{SEC}CIK{company['cik']:010d}.json"
    if provider == "esef":
        return GLEIF + company["lei"]
    if provider == "cn":
        code, exchange = company["code"].split(".")
        return f"{CHINA}?code={exchange}{code}"
    if provider == "hk":
        return f"{HK}?code={company['localCode']}"
    return None

def profile_path(company):
    return CACHE / f"profile-{company['id']}.json"

@lru_cache(maxsize=1)
def directory_profiles():
    path = ROOT/"config/company-directory.json"
    return json.loads(path.read_bytes()) if path.is_file() else {}

@lru_cache(maxsize=1)
def description_translations():
    path = ROOT/"config/company-descriptions-zh.json"
    return json.loads(path.read_bytes()) if path.is_file() else {}

def url_for(value):
    value = (value or "").strip().split(",")[0]
    if not value:
        return None
    value = value if value.startswith(("https://","http://")) else "https://" + value
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.hostname and "." in parsed.hostname and not parsed.username and not re.search(r"\s", value):
        return value
    return None

def join_address(values):
    return ", ".join(str(v).strip() for v in values if v and str(v).strip())

def profile_for(company, curated):
    result = dict(curated.get(company["code"], {}))
    directory = directory_profiles().get(company["id"],{})
    path = profile_path(company)
    raw = json.loads(read_cached(path)) if cached_file(path).is_file() else {}
    provider = company["provider"]
    if provider == "sec" and raw.get("name"):
        a = raw.get("addresses", {}).get("business") or {}
        area = a.get("stateOrCountryDescription") if company["country"] == "US" else a.get("country")
        result["city"] = a.get("city")
        result["address"] = join_address([a.get("street1"),a.get("street2"),a.get("city"),area,a.get("zipCode")])
        result["description"] = result.get("description") or raw.get("description")
        result["website"] = result.get("website") or url_for(raw.get("website")) or url_for(raw.get("investorWebsite"))
        result["profileSource"] = profile_url(company)
    elif provider == "esef" and raw.get("data"):
        a = raw["data"]["attributes"]["entity"].get("headquartersAddress") or {}
        result["city"] = a.get("city") if a.get("country") == company["country"] else None
        result["address"] = join_address([*a.get("addressLines",[]),a.get("city"),a.get("postalCode"),a.get("country")])
        result["profileSource"] = profile_url(company)
    elif provider in {"cn","hk"}:
        candidates = raw.get("jbzl") or raw.get("gszl") or []
        detail = candidates if isinstance(candidates,dict) else candidates[0] if candidates else {}
        if detail:
            result["address"] = detail.get("ADDRESS") or detail.get("OFFICE_ADDRESS") or detail.get("REG_ADDRESS") or detail.get("bgszd") or detail.get("gsdz") or detail.get("bgdz")
            result["description"] = (result.get("description") or detail.get("ORG_PROFILE") or detail.get("gsjj") or detail.get("gsjs") or "").strip()[:720]
            result["website"] = result.get("website") or url_for(detail.get("ORG_WEB") or detail.get("ORG_WEBSITE") or detail.get("gswz") or detail.get("wz"))
            result["profileSource"] = profile_url(company)
    for key,value in directory.items():
        if not result.get(key) and value:
            result[key] = value
            result["directorySource"] = DIRECTORY
    if provider == "sec" and not result.get("description"):
        result["description"] = raw.get("sicDescription")
    if result.get("description"):
        result["description"] = result["description"].replace("\u53e3\u5f84", "标准")
    translation = description_translations().get(company["id"])
    if translation and result.get("description") and not CJK.search(result["description"]):
        result["descriptionZh"] = translation
    return {k:v for k,v in result.items() if v}

class Icons(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "link" and a.get("href") and "icon" in (a.get("rel") or "").lower():
            self.links.append(a["href"])

def cache_icon(company, website):
    for old in CACHE.glob(f"icon-{company['id']}.*"):
        return old
    if not website:
        return None
    urls = [urljoin(website,"/favicon.ico")]
    try:
        page = requests.get(website, timeout=(5,8), stream=True)
        if page.ok and "text/html" in page.headers.get("content-type",""):
            parser = Icons()
            parser.feed(next(page.iter_content(130000), b"").decode(page.encoding or "utf-8", errors="replace"))
            urls = [urljoin(page.url, url) for url in reversed(parser.links)] + urls
        page.close()
    except (requests.RequestException, ValueError, LookupError):
        pass
    for url in list(dict.fromkeys(urls))[:5]:
        if urlsplit(url).scheme not in ("https","http"):
            continue
        try:
            with requests.get(url, timeout=(5,8), stream=True) as response:
                if not response.ok:
                    continue
                kind = IMAGE_TYPES.get(response.headers.get("content-type","").split(";")[0])
                content = next(response.iter_content(180001), b"")
            magic = (content.startswith(b"\x00\x00\x01\x00") or content.startswith(b"\x89PNG\r\n\x1a\n")
                     or content.startswith(b"\xff\xd8\xff") or (content.startswith(b"RIFF") and content[8:12] == b"WEBP"))
            if kind and magic and 8 < len(content) <= 180000:
                path = CACHE / f"icon-{company['id']}.{kind}"
                path.write_bytes(content)
                return path
        except (requests.RequestException, ValueError):
            continue
    return None

def publish_profile(path, company, curated, icons):
    profile = profile_for(company, curated)
    icon = icons.get(company["id"])
    if icon:
        target = path / "logos" / (company["id"] + icon.suffix)
        target.parent.mkdir(exist_ok=True)
        shutil.copyfile(icon,target)
        profile["logo"] = "data/logos/" + target.name
    if profile:
        company["profile"] = profile

def download_profiles(providers=None):
    from hk import hk_catalog
    from issuer import issuer_catalog
    companies = [*catalog(), *esef_catalog(), *hk_catalog(), *issuer_catalog()]
    if providers:
        companies = [c for c in companies if c["provider"] in providers]
    curated = curated_profiles()
    companies.sort(key=lambda c: c["code"] not in curated)
    jobs = {c["id"]: (lambda c=c, url=profile_url(c):get_json(profile_path(c).name,url))
            for c in companies if profile_url(c)}
    errors = run_jobs(jobs,limit=14)
    errors += download_icons(companies,curated)
    (CACHE/"profile-errors.json").write_text(json.dumps(errors,ensure_ascii=False),encoding="utf-8")
    print(f"Company profiles: {len(jobs)} requested, {len(errors)} errors.",flush=True)

def download_icons(companies,curated):
    icon_jobs = {}
    for c in companies:
        website = profile_for(c,curated).get("website")
        if website:
            icon_jobs[c["id"]] = lambda c=c, website=website: cache_icon(c,website)
    return run_jobs(icon_jobs,limit=20)

if __name__ == "__main__":
    download_profiles()
