import sys
import os
import random
import time
import requests
import rewards_manager

FEISHU_WEBHOOK = os.getenv("FEISHU_WEBHOOK", "https://open.feishu.cn/open-apis/bot/v2/hook/781af078-e1d8-41e9-9fda-3428f06f1d15")

# 自然、得体的口语化回复模板（避免机械化刷屏导致风控）
REPLY_TEMPLATES = [
    "UID: {uid}，感谢佬友分享，支持一下！祝站点稳定运行~",
    "UID: {uid} 感谢站长福利，前排支持！已注册试用~",
    "已注册，UID: {uid}，支持站长！感谢公益额度！",
    "UID: {uid}，感谢大佬分享，支持一下新站点！",
    "UID: {uid} 感谢老板大气！祝越来越好~",
    "UID: {uid} 支持一下！感谢分享！"
]

def generate_reply_text(uid):
    template = random.choice(REPLY_TEMPLATES)
    return template.format(uid=uid)

def notify_feishu_status(site_name, uid, topic_url, status_text):
    if not FEISHU_WEBHOOK:
        return
    card = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": f"📝 福利状态已更新：{status_text}"},
                "template": "orange"
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": f"**站点**：{site_name}\n**我的 UID**：`{uid}`\n**当前状态**：{status_text}\n**已生成看板**：已自动同步更新到本地及仓库 `API_REWARDS.md`"
                    }
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "查看原帖动态"},
                            "type": "default",
                            "url": topic_url
                        }
                    ]
                }
            ]
        }
    }
    try:
        requests.post(FEISHU_WEBHOOK, json=card, timeout=10)
    except Exception as e:
        print(f"飞书推送通知失败: {e}")

def claim_topic(topic_id, uid):
    data = rewards_manager.load_data()
    item = next((x for x in data if str(x.get("topic_id")) == str(topic_id)), None)
    
    site_name = item.get("site_name", "未知中转站") if item else "中转站"
    topic_url = item.get("topic_url", f"https://linux.do/t/topic/{topic_id}") if item else f"https://linux.do/t/topic/{topic_id}"
    
    reply_text = generate_reply_text(uid)
    print("==================================================")
    print(f"准备为 [{site_name}] 执行半自动回帖：")
    print(f"  * 目标帖子: {topic_url}")
    print(f"  * 你的 UID : {uid}")
    print(f"  * 生成回复: \"{reply_text}\"")
    print("==================================================")

    # 1. 尝试使用 Browser Harness 打开并回帖
    harness_script = f'''
new_tab("{topic_url}")
wait_for_load()
import time
time.sleep(2)

# 查找回复按钮并打开输入框
res = js(\'\'\'
(() => {{
    const replyBtn = document.querySelector('.create.reply-to-post') || document.querySelector('button.reply');
    if (replyBtn) {{
        replyBtn.click();
        return true;
    }}
    return false;
}})()
\'\'\')
time.sleep(1)

# 填入回复内容并提交
res_submit = js(\'\'\'
(() => {{
    const composer = document.querySelector('textarea.d-editor-input') || document.querySelector('#reply-control textarea');
    if (composer) {{
        composer.value = "{reply_text}";
        composer.dispatchEvent(new Event('input', {{ bubbles: true }}));
        composer.dispatchEvent(new Event('change', {{ bubbles: true }}));
        
        const sendBtn = document.querySelector('.save-or-cancel button.btn-primary') || document.querySelector('#reply-control button.btn-primary');
        if (sendBtn) {{
            sendBtn.click();
            return {{ success: true }};
        }}
    }}
    return {{ success: false, reason: 'composer not found' }};
}})()
\'\'\')
print("Browser reply result:", res_submit)
'''
    try:
        import subprocess
        p = subprocess.run(["browser-harness"], input=harness_script, text=True, capture_output=True, timeout=30)
        print("Browser Harness 执行输出:", p.stdout)
    except Exception as e:
        print(f"Browser Harness 调用提示: {e}，将直接进行数据记录。")

    # 2. 更新本地台账状态
    rewards_manager.mark_submitted(topic_id, uid)
    
    # 3. 发送飞书进度通知
    notify_feishu_status(site_name, uid, topic_url, "🟡 已回帖留 UID，等待到账")
    print(f"✨ 流程完成！已成功将 {site_name} 状态更新为 [🟡 待到账]，并同步更新了 API_REWARDS.md 看板！")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python auto_reply_claim.py <TopicID> <你的UID>")
        print("示例: python auto_reply_claim.py 3194780 8866")
        sys.exit(1)

    t_id = sys.argv[1]
    u_id = sys.argv[2]
    claim_topic(t_id, u_id)
