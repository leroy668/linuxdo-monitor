import os
import requests
import json

TARGET_USER = os.getenv("TARGET_USER", "Andrew-hh")
# 目标帖子 ID：2696141 （对应帖子：【公益推广】千刀兄开启美好11月...）
TARGET_TOPIC_ID = os.getenv("TARGET_TOPIC_ID", "2696141")
FEISHU_WEBHOOK = os.getenv("FEISHU_WEBHOOK")
STATE_FILE = "seen_ids.txt"

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
        for pid in sorted(seen_ids):
            f.write(f"{pid}\n")

def send_feishu_card(user, title, floor, post_url, created_at, content):
    if not FEISHU_WEBHOOK:
        print("[错误] 未配置 FEISHU_WEBHOOK")
        return

    elements = [
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"**作者**：`@{user}`\n**所在帖子**：{title}\n**楼层**：`#{floor} 楼`\n**时间**：{created_at}"
            }
        }
    ]

    if content:
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"**💬 回复内容**：\n> {content}"
            }
        })

    elements.append({
        "tag": "action",
        "actions": [
            {
                "tag": "button",
                "text": {
                    "tag": "plain_text",
                    "content": f"👉 直达 #{floor} 楼回复"
                },
                "type": "primary",
                "url": post_url
            }
        ]
    })

    card_data = {
        "msg_type": "interactive",
        "card": {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": f"⚡ {user} 在目标帖子发了新回复！"
                },
                "template": "carmine"
            },
            "elements": elements
        }
    }

    try:
        resp = requests.post(FEISHU_WEBHOOK, json=card_data, timeout=10)
        print(f"[飞书推送响应] 状态码: {resp.status_code}, 内容: {resp.text}")
    except Exception as e:
        print(f"[飞书推送异常] {e}")

def fetch_user_actions():
    actions = []
    # 接口 1: user_actions (精确回帖流 filter=5 为回帖，4 为主帖)
    url1 = f"https://linux.do/user_actions.json?offset=0&username={TARGET_USER}&filter=4,5"
    try:
        resp = requests.get(url1, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            actions.extend(data.get("user_actions", []))
    except Exception as e:
        print(f"请求 user_actions 接口失败: {e}")

    # 接口 2: activity.json (综合活动备份)
    if not actions:
        url2 = f"https://linux.do/u/{TARGET_USER}/activity.json"
        try:
            resp = requests.get(url2, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                actions.extend(data.get("user_actions", []))
        except Exception as e:
            print(f"请求 activity.json 接口失败: {e}")

    return actions

def main():
    print("==================================================")
    print(f"正在监控用户 [@{TARGET_USER}] 在帖子 [{TARGET_TOPIC_ID or '全帖'}] 的最新回复...")
    seen_ids, is_first_run = load_seen_ids()

    actions = fetch_user_actions()
    if not actions:
        print(f"未获取到用户 @{TARGET_USER} 的任何活动记录。")
        return

    # 过滤出符合条件的回复 (如果有指定 TARGET_TOPIC_ID 则匹配指定帖子)
    matched_posts = []
    for act in actions:
        act_topic_id = str(act.get("topic_id", ""))
        post_id = str(act.get("post_id", ""))

        if not post_id:
            continue

        if TARGET_TOPIC_ID and act_topic_id != str(TARGET_TOPIC_ID):
            continue

        matched_posts.append(act)

    print(f"匹配到用户在目标帖子下的相关发言共 {len(matched_posts)} 条。")

    # 首次运行做防轰炸初始化：记录现存 post_id，不触发通知
    if is_first_run:
        print("首次初始化运行，记录当前既有回复 ID，不发送旧回复通知...")
        for act in matched_posts:
            seen_ids.add(str(act.get("post_id")))
        save_seen_ids(seen_ids)
        print(f"初始化完成，已记录 {len(seen_ids)} 条既有回复。后续有新回复将即时推送！")
        return

    new_found = False
    # 按时间正序处理（从旧到新推送）
    for act in reversed(matched_posts):
        post_id = str(act.get("post_id"))
        if post_id not in seen_ids:
            title = act.get("title", "公益帖子")
            topic_id = act.get("topic_id", TARGET_TOPIC_ID)
            floor = act.get("post_number", "")
            slug = act.get("slug", "topic")
            # 拼接直达该楼层的 URL
            post_url = f"https://linux.do/t/{slug}/{topic_id}/{floor}"
            created_at = act.get("created_at", "")[:19].replace("T", " ")
            excerpt = act.get("excerpt", "").strip().replace("\n", " ")

            print(f"🔥 [发现新回复] #{floor} 楼 | 时间: {created_at} | 内容: {excerpt[:50]}")
            send_feishu_card(TARGET_USER, title, floor, post_url, created_at, excerpt)

            seen_ids.add(post_id)
            new_found = True

    if new_found:
        save_seen_ids(seen_ids)
        print("状态已持久化更新。")
    else:
        print("暂无新回复。")

if __name__ == "__main__":
    main()
