"""Fetch the pinned source checkouts needed to run or rebuild AlphaNode."""
import argparse
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = {
    "crible": ["src/crible"],
    "financetoolkit": ["financetoolkit"],
    "financedatabase": ["financedatabase"],
    "akshare": ["akshare"],
    "openbb": [
        "openbb_platform/core/openbb",
        "openbb_platform/core/openbb_core",
        "openbb_platform/providers/federal_reserve/openbb_federal_reserve/models",
        "openbb_platform/providers/ecb/openbb_ecb/utils",
    ],
    "superset": ["superset-frontend/plugins/plugin-chart-echarts/src/Timeseries"],
}


def git(directory, *args, capture=False):
    return subprocess.run(["git", "-C", str(directory), *args], check=True, text=True,
                          capture_output=capture).stdout


def install(pin):
    path = ROOT / pin["checkout"]
    path.mkdir(parents=True, exist_ok=True)
    if (path / ".git").exists():
        try:
            if git(path, "rev-parse", "HEAD", capture=True).strip() == pin["commit"]:
                return
        except subprocess.CalledProcessError:
            if any(item.name != ".git" for item in path.iterdir()):
                raise
        else:
            raise SystemExit(f"{pin['checkout']} is already checked out at a different revision.")
    else:
        if any(path.iterdir()):
            raise SystemExit(f"{pin['checkout']} already contains files.")
        git(path, "init", "--quiet")
    try:
        origin = git(path, "remote", "get-url", "origin", capture=True).strip()
    except subprocess.CalledProcessError:
        git(path, "remote", "add", "origin", pin["repository"])
    else:
        if origin != pin["repository"]:
            raise SystemExit(f"{pin['checkout']} has a different origin.")
    git(path, "config", "remote.origin.promisor", "true")
    git(path, "config", "remote.origin.partialclonefilter", "blob:none")
    git(path, "sparse-checkout", "set", "--cone", *DIRECTORIES[path.name])
    git(path, "fetch", "--no-tags", "--depth=1", "--filter=blob:none", "origin", pin["commit"])
    git(path, "checkout", "--detach", "--quiet", "FETCH_HEAD")
    if git(path, "rev-parse", "HEAD", capture=True).strip() != pin["commit"]:
        raise SystemExit(f"Revision verification failed for {pin['checkout']}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", action="store_true", help="Fetch only Crible for advanced screening.")
    args = parser.parse_args()
    pins = json.loads((ROOT / "upstream.lock.json").read_bytes())
    for pin in pins:
        if not args.runtime or pin["checkout"] == "upstream/crible":
            install(pin)


if __name__ == "__main__":
    main()
