"""Refresh source caches and rebuild the local datasets."""
import argparse
import os

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cached",action="store_true",help="Rebuild using the available raw caches")
    parser.add_argument("--force",action="store_true",help="Recheck cached URLs, keeping old copies if requests fail")
    parser.add_argument("--macro-only",action="store_true",help="Update the macro atlas without rebuilding company financials")
    args=parser.parse_args()
    if args.force and args.cached:
        parser.error("--cached and --force are mutually exclusive")
    if args.force:
        os.environ["INDUSTRYLAB_REFRESH"]="1"
    from macro_atlas import build as build_macro
    if args.macro_only:
        build_macro(args.cached)
        return
    from build import build
    from fetch import catalog,download_companies
    from fetch_china import download_china
    from fetch_industry import download_industry
    from fetch_unido import download_unido
    from fetch_regional import download_regional
    from xbrl import download_xbrl
    from issuer import download_issuers
    from research_sources import download_research_sources
    from research_build import write_warehouse
    from hk import download_hk
    from profiles import download_profiles
    from workbench_macro import download_macro
    if not args.cached:
        download_companies(catalog())
        download_industry()
        download_china()
        download_unido()
        download_regional()
        download_xbrl()
        download_issuers()
        download_research_sources()
        download_hk()
        download_profiles()
        download_macro()
    build()
    build_macro(args.cached)
    write_warehouse()

if __name__=="__main__":
    main()
