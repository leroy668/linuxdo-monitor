import json
import os
import sys
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "rewards_data.json")
BOARD_FILE = os.path.join(BASE_DIR, "API_REWARDS.md")

STATUS_ACTIVE = "ACTIVE"        # 🟢 主力在用
STATUS_STANDBY = "STANDBY"      # 🟡 备用有钱
STATUS_PENDING = "PENDING"      # 🔴 待领福利
STATUS_SUBMITTED = "SUBMITTED"  # 📋 审核中
STATUS_ARCHIVED = "ARCHIVED"    # ⚫ 难用废弃

def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return []

def save_data(data):
    for x in data:
        if x.get("status") == "DEPLETED":
            x["status"] = STATUS_ARCHIVED
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    render_markdown(data)

def render_markdown(data):
    active = [x for x in data if x.get("status") == STATUS_ACTIVE]
    standby = [x for x in data if x.get("status") == STATUS_STANDBY]
    pending = [x for x in data if x.get("status") in [STATUS_PENDING, STATUS_SUBMITTED]]
    archived = [x for x in data if x.get("status") in [STATUS_ARCHIVED, "DEPLETED"]]

    lines = [
        "# ⚡ 中转站资产全景大清查看板",
        "",
        f"> **更新时间**：`{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}`  ",
        f"> **统计概览**：总收录 `{len(data)}` 个站点 ｜ 🟢 主力在用: `{len(active)}` ｜ 🟡 备用有钱: `{len(standby)}` ｜ 🔴 待领福利: `{len(pending)}` ｜ ⚫ 废弃隐藏: `{len(archived)}`",
        "",
        "---",
        "",
        "## 🟢 主力在用 (速度快 / 余额足 / 常用)",
        "",
        "| 站点名称 | 控制台/官网链接 | 备注/剩余额度 |",
        "| :--- | :--- | :--- |",
    ]

    for item in active:
        name = item.get("site_name", "未知站点")
        url = item.get("site_url", "")
        link = f"[{name}]({url})" if url else name
        notes = item.get("notes") or item.get("reward_desc") or "-"
        lines.append(f"| **{name}** | {link} | {notes} |")

    lines.extend([
        "",
        "## 🟡 备用有钱 (有残余额度 / 备用站)",
        "",
        "| 站点名称 | 控制台链接 | 备注/残余额度 |",
        "| :--- | :--- | :--- |",
    ])
    for item in standby:
        name = item.get("site_name", "未知站点")
        url = item.get("site_url", "")
        link = f"[{name}]({url})" if url else name
        notes = item.get("notes") or item.get("reward_desc") or "-"
        lines.append(f"| **{name}** | {link} | {notes} |")

    lines.extend([
        "",
        "## 🔴 待领福利帖 (LINUX DO 羊毛线报)",
        "",
        "| 活动标题 | 福利额度 | 原帖直达 | 我的 UID |",
        "| :--- | :--- | :--- | :--- |",
    ])
    for item in pending:
        name = item.get("site_name", "福利贴")
        reward = item.get("reward_desc", "送额度")
        url = item.get("topic_url", "")
        link = f"[原帖直达]({url})" if url else "-"
        uid = f"`{item.get('my_uid')}`" if item.get('my_uid') else "未留"
        lines.append(f"| **{name}** | {reward} | {link} | {uid} |")

    lines.append("")
    with open(BOARD_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[OK] 看板已保存到 {BOARD_FILE}")

if __name__ == "__main__":
    save_data(load_data())
