"""Load selected modules from the source checkouts retained with the workbench."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "upstream"
SOURCE_PATHS = (
    UPSTREAM / "crible/src",
    UPSTREAM / "financetoolkit",
    UPSTREAM / "financedatabase",
    UPSTREAM / "akshare",
    UPSTREAM / "openbb/openbb_platform/core",
)

def activate():
    for path in SOURCE_PATHS:
        name = str(path)
        if name not in sys.path:
            sys.path.insert(0, name)

def load_selected(name, path):
    """Load one self-contained provider module without registering its entire package."""
    spec = spec_from_file_location(name, UPSTREAM / path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Missing upstream source: {path}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

activate()
