#!/usr/bin/env python3
"""Regenerate every F018 seed asset, then validate and write SUMMARY.md."""

from __future__ import annotations

import sys

from generate_images import main as generate_images_main
from generate_manifest import main as generate_manifest_main
from generate_maps import build_tiles
from generate_models import main as generate_models_main
from verify_assets import main as verify_main


def main():
    print("== models ==")
    generate_models_main()
    print("== maps and tiles ==")
    build_tiles()
    print("== images and SVG ==")
    generate_images_main()
    print("== manifest ==")
    generate_manifest_main()
    print("== verification ==")
    return verify_main()


if __name__ == "__main__":
    sys.exit(main())
