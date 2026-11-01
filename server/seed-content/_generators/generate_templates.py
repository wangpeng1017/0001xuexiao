"""生成 server/seed-content/templates 下的场景模板 JSON（封面 PNG 为真实截图，不由本脚本生成）。

用法：python server/seed-content/_generators/generate_templates.py
生成后执行 `pnpm --dir web validate:templates` 校验，`pnpm --dir server db:seed` 导入。
"""

from __future__ import annotations

import json
from pathlib import Path

import template_campus
import template_data
import template_device
import template_ship

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

BUILDERS = {
    "campus-3d": template_campus.build_campus,
    "campus-security": template_campus.build_security,
    "device-monitor": template_device.build,
    "teaching-stats": template_data.build_teaching,
    "energy-manage": template_data.build_energy,
    "ship-twin": template_ship.build,
}


def main():
    for name, build in BUILDERS.items():
        data = build()
        path = TEMPLATES_DIR / f"{name}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{path.name}: {len(data['content']['componentList'])} 个组件")


if __name__ == "__main__":
    main()
