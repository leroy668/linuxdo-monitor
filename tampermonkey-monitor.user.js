// ==UserScript==
// @name         LINUX DO 刀哥发帖飞书秒级秒推
// @namespace    https://github.com/leroy668/linuxdo-monitor
// @version      1.0
// @description  利用浏览器真实登录态，每 30 秒静默轮询 Andrew-hh 在千刀贴的最新发言，100% 穿透 Cloudflare，秒级推送飞书！
// @author       Antigravity
// @match        https://linux.do/*
// @grant        GM_xmlhttpRequest
// @connect      open.feishu.cn
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_USER = 'Andrew-hh';
    const TARGET_TOPIC_ID = '2696141';
    const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/781af078-e1d8-41e9-9fda-3428f06f1d15';
    const CHECK_INTERVAL_SEC = 30; // 每 30 秒巡逻一次

    const SEEN_STORAGE_KEY = 'linuxdo_seen_andrew_posts';

    function getSeenIds() {
        try {
            return new Set(JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) || '[]'));
        } catch(e) {
            return new Set();
        }
    }

    function saveSeenIds(setObj) {
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...setObj]));
    }

    function sendFeishu(user, title, floor, postUrl, timeStr, content) {
        const cardData = {
            msg_type: "interactive",
            card: {
                config: { wide_screen_mode: true },
                header: {
                    title: { tag: "plain_text", content: `⚡ 刀哥发新回复了！(#${floor} 楼)` },
                    template: "carmine"
                },
                elements: [
                    {
                        tag: "div",
                        text: {
                            tag: "lark_md",
                            content: `**作者**：\`@${user}\`\n**所在帖子**：${title}\n**楼层**：\`#${floor} 楼\`\n**时间**：${timeStr}`
                        }
                    },
                    {
                        tag: "div",
                        text: {
                            tag: "lark_md",
                            content: `**💬 回复内容**：\n> ${content}`
                        }
                    },
                    {
                        tag: "action",
                        actions: [
                            {
                                tag: "button",
                                text: { tag: "plain_text", content: `👉 直达 #${floor} 楼` },
                                type: "primary",
                                url: postUrl
                            }
                        ]
                    }
                ]
            }
        };

        if (typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest({
                method: "POST",
                url: FEISHU_WEBHOOK,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify(cardData),
                onload: (res) => console.log('[刀哥监控] 飞书推送成功:', res.responseText)
            });
        } else {
            fetch(FEISHU_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cardData)
            }).catch(() => {});
        }
    }

    async function checkPosts() {
        try {
            const resp = await fetch(`/user_actions.json?offset=0&username=${TARGET_USER}&filter=4,5&t=${Date.now()}`);
            if (!resp.ok) return;
            const data = await resp.json();
            const actions = data.user_actions || [];

            let seenIds = getSeenIds();
            let isFirst = (seenIds.size === 0);

            // 过滤目标话题
            const matched = actions.filter(act => String(act.topic_id) === TARGET_TOPIC_ID);

            if (isFirst) {
                matched.forEach(a => seenIds.add(String(a.post_id)));
                saveSeenIds(seenIds);
                console.log(`[刀哥监控] 初始化完成，已记录既有发言 ${seenIds.size} 条。`);
                return;
            }

            for (const act of matched.reverse()) {
                const pid = String(act.post_id);
                if (!seenIds.has(pid)) {
                    const floor = act.post_number;
                    const url = `https://linux.do/t/topic/${TARGET_TOPIC_ID}/${floor}`;
                    const timeStr = (act.created_at || '').replace('T', ' ').slice(0, 19);
                    const excerpt = act.excerpt || '';
                    console.log(`🔥 [刀哥监控发现新回复] #${floor} 楼: ${excerpt}`);
                    sendFeishu(TARGET_USER, act.title, floor, url, timeStr, excerpt);
                    seenIds.add(pid);
                }
            }
            saveSeenIds(seenIds);
        } catch (e) {
            console.error('[刀哥监控] 检测异常', e);
        }
    }

    // 启动定时巡逻
    console.log('[刀哥监控] 油猴脚本已激活，每 30 秒巡逻一次...');
    setTimeout(checkPosts, 3000);
    setInterval(checkPosts, CHECK_INTERVAL_SEC * 1000);
})();
