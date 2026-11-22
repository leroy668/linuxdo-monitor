import json
import os
import sys
from datetime import datetime

DATA_FILE = "rewards_data.json"
BOARD_FILE = "API_REWARDS.md"

STATUS_PENDING = "PENDING"      # 🔴 待领取 (未留UID)
STATUS_SUBMITTED = "SUBMITTED"  # 🟡 待到账 (已回帖留UID)
STATUS_CLAIMED = "CLAIMED"      # 🟢 已到账 (额度已就绪)
STATUS_EXPIRED = "EXPIRED"      # ⚪ 已失效 (活动结束)

STATUS_MAP = {
    STATUS_PENDING: ("🔴 待领取", "新线报，尚未注册或尚未留 UID"),
    STATUS_SUBMITTED: ("🟡 待到账", "已回帖留 UID，等待站长加额度"),
    STATUS_CLAIMED: ("🟢 已到账", "额度已到账，可正常使用"),
    STATUS_EXPIRED: ("⚪ 已失效", "活动名额已满或已过期"),
}

def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return []

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    render_markdown(data)

def render_markdown(data):
    """自动将 JSON 数据渲染为美观直观的 Markdown 看板"""
    pending = [x for x in data if x.get("status") == STATUS_PENDING]
    submitted = [x for x in data if x.get("status") == STATUS_SUBMITTED]
    claimed = [x for x in data if x.get("status") == STATUS_CLAIMED]
    expired = [x for x in data if x.get("status") == STATUS_EXPIRED]

    lines = [
        "# 🎁 LINUX DO 中转站福利领取总览看板",
        "",
        f"> **更新时间**：`{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}`  ",
        f"> **汇总统计**：总线报 `{len(data)}` 处 ｜ 🔴 待领取: `{len(pending)}` ｜ 🟡 待到账: `{len(submitted)}` ｜ 🟢 已到账: `{len(claimed)}`",
        "",
        "---",
        "",
        "## 🔴 待领取 (尚未留 UID / 尚未注册)",
        "",
        "| 站点名称 | 福利额度 | 中转站网址 | 原帖链接 | 关键规则/备注 |",
        "| :--- | :--- | :--- | :--- | :--- |",
    ]

    if not pending:
        lines.append("| - | 暂无待领取福利 | - | - | - |")
    else:
        for item in pending:
            s_name = item.get("site_name", "未知站点")
            reward = item.get("reward_desc", "-")
            site_url = item.get("site_url", "")
            url_link = f"[{s_name}]({site_url})" if site_url else s_name
            t_url = f"[直达帖子]({item.get('topic_url', '')})"
            note = item.get("notes", "-")
            lines.append(f"| **{s_name}** | {reward} | {url_link} | {t_url} | {note} |")

    lines.extend([
        "",
        "## 🟡 待到账 (已回帖留 UID，等待站长加额度)",
        "",
        "| 站点名称 | 福利额度 | 我的 UID | 回帖时间 | 原帖直达 | 状态跟踪 |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ])

    if not submitted:
        lines.append("| - | 暂无待审核项 | - | - | - | - |")
    else:
        for item in submitted:
            s_name = item.get("site_name", "未知站点")
            reward = item.get("reward_desc", "-")
            my_uid = f"`{item.get('my_uid', '-')}`"
            sub_time = item.get("submitted_at", item.get("updated_at", "-"))
            t_url = f"[查看原帖]({item.get('topic_url', '')})"
            lines.append(f"| **{s_name}** | {reward} | {my_uid} | {sub_time} | {t_url} | 站长审核中 |")

    lines.extend([
        "",
        "## 🟢 已到账 (额度就绪，可随时调用)",
        "",
        "| 站点名称 | 实际到账 | 我的 UID / 账号 | 中转站网址 | 渠道/倍率亮点 |",
        "| :--- | :--- | :--- | :--- | :--- |",
    ])

    if not claimed:
        lines.append("| - | 暂无已到账记录 | - | - | - |")
    else:
        for item in claimed:
            s_name = item.get("site_name", "未知站点")
            reward = item.get("reward_desc", "-")
            my_uid = f"`{item.get('my_uid', '-')}`"
            site_url = item.get("site_url", "")
            url_link = f"[登录控制台]({site_url})" if site_url else s_name
            note = item.get("notes", "-")
            lines.append(f"| **{s_name}** | {reward} | {my_uid} | {url_link} | {note} |")

    lines.append("")
    with open(BOARD_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[OK] 看板已更新保存到 {BOARD_FILE}")

def add_or_update_record(topic_id, site_name, site_url, reward_desc, notes="", topic_url=""):
    data = load_data()
    item = next((x for x in data if str(x.get("topic_id")) == str(topic_id)), None)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if not item:
        item = {
            "topic_id": str(topic_id),
            "site_name": site_name,
            "site_url": site_url,
            "reward_desc": reward_desc,
            "status": STATUS_PENDING,
            "my_uid": "",
            "topic_url": topic_url or f"https://linux.do/t/topic/{topic_id}",
            "created_at": now_str,
            "updated_at": now_str,
            "notes": notes
        }
        data.append(item)
        print(f"[新增线报] {site_name} (Topic ID: {topic_id})")
    else:
        item["site_name"] = site_name or item["site_name"]
        item["site_url"] = site_url or item["site_url"]
        item["reward_desc"] = reward_desc or item["reward_desc"]
        item["notes"] = notes or item["notes"]
        item["updated_at"] = now_str
        print(f"[更新线报] {site_name} (Topic ID: {topic_id})")

    save_data(data)
    return item

def mark_submitted(topic_id, my_uid):
    data = load_data()
    item = next((x for x in data if str(x.get("topic_id")) == str(topic_id)), None)
    if not item:
        print(f"[错误] 未找到 Topic ID 为 {topic_id} 的记录！")
        return False

    item["status"] = STATUS_SUBMITTED
    item["my_uid"] = str(my_uid)
    item["submitted_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    item["updated_at"] = item["submitted_at"]
    save_data(data)
    print(f"[已标记为待到账] {item.get('site_name')} (UID: {my_uid})")
    return True

def mark_claimed(topic_id):
    data = load_data()
    item = next((x for x in data if str(x.get("topic_id")) == str(topic_id)), None)
    if not item:
        print(f"[错误] 未找到 Topic ID 为 {topic_id} 的记录！")
        return False

    item["status"] = STATUS_CLAIMED
    item["claimed_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    item["updated_at"] = item["claimed_at"]
    save_data(data)
    print(f"[已标记为已到账] {item.get('site_name')}")
    return True

if __name__ == "__main__":
    # 命令行快速操作支持
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "list":
            render_markdown(load_data())
        elif cmd == "submit" and len(sys.argv) >= 4:
            mark_submitted(sys.argv[2], sys.argv[3])
        elif cmd == "done" and len(sys.argv) >= 3:
            mark_claimed(sys.argv[2])
    else:
        render_markdown(load_data())
