import os
import json
import sys

# 优先使用 curl_cffi 模拟真实浏览器 TLS 指纹穿透 Cloudflare
try:
    from curl_cffi import requests as http
    USE_CURL_CFFI = True
except ImportError:
    import requests as http
    USE_CURL_CFFI = False

TARGET_USER = os.getenv("TARGET_USER", "Andrew-hh")
TARGET_TOPIC_ID = os.getenv("TARGET_TOPIC_ID", "2696141")
FEISHU_WEBHOOK = os.getenv("FEISHU_WEBHOOK")
LINUXDO_COOKIE = os.getenv("LINUXDO_COOKIE", "").strip()
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seen_ids.txt")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://linux.do/",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
}

if LINUXDO_COOKIE:
    HEADERS["Cookie"] = LINUXDO_COOKIE

def http_get(url):
    kwargs = {"headers": HEADERS, "timeout": 15}
    if USE_CURL_CFFI:
        kwargs["impersonate"] = "chrome120"
    return http.get(url, **kwargs)

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
        resp = http.post(FEISHU_WEBHOOK, json=card_data, timeout=10)
        print(f"[飞书推送响应] 状态码: {resp.status_code}, 内容: {resp.text}")
    except Exception as e:
        print(f"[飞书推送异常] {e}")

def fetch_user_actions():
    actions = []
    url1 = f"https://linux.do/user_actions.json?offset=0&username={TARGET_USER}&filter=4,5"
    try:
        resp = http_get(url1)
        if resp.status_code == 200:
            data = resp.json()
            actions.extend(data.get("user_actions", []))
        else:
            print(f"[警告] user_actions 接口返回状态码: {resp.status_code}")
            if resp.status_code in (403, 429):
                print("[错误] 受到 Cloudflare 拦截！请检查 LINUXDO_COOKIE 是否有效并更新。")
    except Exception as e:
        print(f"请求 user_actions 接口失败: {e}")

    if not actions:
        url2 = f"https://linux.do/u/{TARGET_USER}/activity.json"
        try:
            resp = http_get(url2)
            if resp.status_code == 200:
                data = resp.json()
                actions.extend(data.get("user_actions", []))
            else:
                print(f"[警告] activity 接口返回状态码: {resp.status_code}")
        except Exception as e:
            print(f"请求 activity.json 接口失败: {e}")

    return actions

def main():
    print("==================================================")
    print(f"模式: {'curl_cffi (浏览器指纹伪装)' if USE_CURL_CFFI else '标准 requests'}")
    print(f"Cookie 状态: {'已配置 (长度 ' + str(len(LINUXDO_COOKIE)) + ')' if LINUXDO_COOKIE else '未配置 (极易被 Cloudflare 拦截)'}")
    print(f"正在监控用户 [@{TARGET_USER}] 在帖子 [{TARGET_TOPIC_ID or '全帖'}] 的最新回复...")
    
    seen_ids, is_first_run = load_seen_ids()

    actions = fetch_user_actions()
    if not actions:
        print(f"未获取到用户 @{TARGET_USER} 的任何活动记录。")
        return

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

    if is_first_run:
        print("首次初始化运行，记录当前既有回复 ID，不发送旧回复通知...")
        for act in matched_posts:
            seen_ids.add(str(act.get("post_id")))
        save_seen_ids(seen_ids)
        print(f"初始化完成，已记录 {len(seen_ids)} 条既有回复。后续有新回复将即时推送！")
        return

    new_found = False
    for act in reversed(matched_posts):
        post_id = str(act.get("post_id"))
        if post_id not in seen_ids:
            title = act.get("title", "公益帖子")
            topic_id = act.get("topic_id", TARGET_TOPIC_ID)
            floor = act.get("post_number", "")
            slug = act.get("slug", "topic")
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
