#!/usr/bin/env python3
"""Regenerate every F018 seed asset, then validate and write SUMMARY.md.

仅重新生成“程序生成”的素材；models/third-party/ 下的第三方 CC0 模型与 previews/ 中对应预览图为
仓库内固定文件，不会被重写，manifest 会保留并由 verify_assets.py 校验。
"""

from __future__ import annotations

import sys

from generate_images import main as generate_images_main
from generate_manifest import main as generate_manifest_main
from generate_maps import build_tiles
from generate_model_previews import main as generate_model_previews_main
from generate_models import main as generate_models_main
from verify_assets import main as verify_main


def main():
    print("== models ==")
    generate_models_main()
    print("== model previews ==")
    generate_model_previews_main()
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
