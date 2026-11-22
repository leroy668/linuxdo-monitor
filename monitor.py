import os
import requests
import json

TARGET_USER = os.getenv("TARGET_USER", "Andrew-hh")
FEISHU_WEBHOOK = os.getenv("FEISHU_WEBHOOK")
STATE_FILE = "seen_ids.txt"

API_URL = f"https://linux.do/u/{TARGET_USER}/activity/topics.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def load_seen_ids():
    if not os.path.exists(STATE_FILE):
        return set(), True
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return set(line.strip() for line in f if line.strip()), False

def save_seen_ids(seen_ids):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        for tid in sorted(seen_ids):
            f.write(f"{tid}\n")

def send_feishu_card(title, url, created_at, excerpt=""):
    if not FEISHU_WEBHOOK:
        print("[错误] 未配置 FEISHU_WEBHOOK，请在 GitHub Secrets 中配置！")
        return

    content_text = f"**作者**：`@{TARGET_USER}`\n**标题**：{title}\n**时间**：{created_at}"
    if excerpt:
        content_text += f"\n**摘要**：\n> {excerpt}"

    card_data = {
        "msg_type": "interactive",
        "card": {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": "📢 LINUX DO 新帖通知"
                },
                "template": "blue"
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": content_text
                    }
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {
                                "tag": "plain_text",
                                "content": "点击查看帖子"
                            },
                            "type": "primary",
                            "url": url
                        }
                    ]
                }
            ]
        }
    }

    try:
        resp = requests.post(FEISHU_WEBHOOK, json=card_data, timeout=10)
        print(f"[飞书推送响应] 状态码: {resp.status_code}, 内容: {resp.text}")
    except Exception as e:
        print(f"[飞书推送失败] {e}")

def main():
    print(f"==================================================")
    print(f"正在检测 LINUX DO 用户 [@{TARGET_USER}] 的发帖动态...")
    seen_ids, is_first_run = load_seen_ids()

    try:
        resp = requests.get(API_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[错误] 请求 LINUX DO 接口失败: {e}")
        return

    topics = data.get("topic_list", {}).get("topics", [])
    if not topics:
        print("未获取到该用户的任何帖子列表。")
        return

    # 首次运行防止旧帖子全量轰炸
    if is_first_run:
        print(f"[首次初始化] 发现 {len(topics)} 篇既有帖子，记录 ID，不触发推送。")
        for t in topics:
            seen_ids.add(str(t["id"]))
        save_seen_ids(seen_ids)
        print("初始化已完成，后续产生新帖将触发飞书推送。")
        return

    new_found = False
    # 按时间由旧到新处理，确保通知顺序一致
    for t in reversed(topics):
        topic_id = str(t["id"])
        if topic_id not in seen_ids:
            title = t.get("title", "无标题")
            slug = t.get("slug", "topic")
            topic_url = f"https://linux.do/t/{slug}/{topic_id}"
            created_at = t.get("created_at", "")[:19].replace("T", " ")
            excerpt = t.get("excerpt", "").strip().replace("\n", " ")
            if len(excerpt) > 100:
                excerpt = excerpt[:100] + "..."

            print(f"[发现新帖] ID: {topic_id} | 标题: {title}")
            send_feishu_card(title, topic_url, created_at, excerpt)

            seen_ids.add(topic_id)
            new_found = True

    if new_found:
        save_seen_ids(seen_ids)
        print("状态已持久化更新。")
    else:
        print("检查完毕，暂无新发帖。")

if __name__ == "__main__":
    main()
