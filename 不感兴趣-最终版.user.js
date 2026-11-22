// ==UserScript==
// @name         Linux.do 账号级“不感兴趣” (原生 Mute 云端同步) + 刀哥监控
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  收藏夹跨设备同步（基于 Discourse 书签）：收藏即隐藏，手机电脑一致；另支持左右滑动忽略、批量、关键词自动忽略；集成刀哥千刀贴秒级飞书监控
// @author       You
// @match        https://linux.do/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      open.feishu.cn
// ==/UserScript==

(function () {
    'use strict';

    const LOG = '[不感兴趣]';
    const SKEY_MUTED = 'ld_muted_topic_ids_v22';
    const SKEY_SETTINGS = 'ld_mute_settings_v22';

    // =============================================================== 样式
    const CSS = `
        /* 行内小叉：默认半透明，悬停才明显 */
        tr.topic-list-item .ld-x {
            float: right !important;
            margin: 2px 0 2px 8px !important;
            padding: 2px 7px !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
            color: #d9534f !important;
            background: #f2dede !important;
            border: 1px solid #ebccd1 !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            touch-action: manipulation !important;
            opacity: .28;
            transition: opacity .15s, background-color .15s;
            white-space: nowrap !important;
        }
        tr.topic-list-item:hover .ld-x,
        tr.topic-list-item.ld-hot .ld-x { opacity: 1; }
        tr.topic-list-item .ld-x:hover { background: #d9534f !important; color: #fff !important; }
        tr.topic-list-item .ld-x.is-busy { pointer-events: none !important; opacity: .6 !important; }
        @media (hover: none) { tr.topic-list-item .ld-x { opacity: .95; } }

        /* 悬停 / 选中高亮 */
        tr.topic-list-item.ld-hot > td { background: rgba(217, 83, 79, .07) !important; }
        tr.topic-list-item.ld-selected > td { background: rgba(64, 128, 226, .14) !important; }
        tr.topic-list-item.ld-selected .ld-x { opacity: 0; }
        tr.ld-muted-row,
        .ld-muted-row { display: none !important; }

        /* ---------- 收藏夹入口按钮 ---------- */
        #ld-fab {
            position: fixed; left: 16px; bottom: 20px; z-index: 99996;
            display: flex; align-items: center; gap: 4px;
            padding: 7px 11px; border-radius: 999px; cursor: pointer;
            border: 1px solid rgba(140, 140, 150, .35);
            background: rgba(44, 44, 46, .82); color: #fff;
            font: 13px/1.2 ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", sans-serif;
            box-shadow: 0 4px 16px rgba(0, 0, 0, .3);
            opacity: .45; transition: opacity .15s, transform .15s;
            touch-action: manipulation;
        }
        #ld-fab:hover, #ld-fab:active { opacity: 1; transform: translateY(-1px); }
        #ld-fab.has-items { opacity: .9; }
        #ld-fab-count { font-size: 11px; opacity: .9; }

        /* ---------- 帖子页操作条 ---------- */
        #ld-collect-bar {
            display: flex; align-items: center; gap: 8px;
            margin: 8px 0 4px;
            font: 13px/1.4 ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", sans-serif;
        }
        #ld-collect-bar button {
            font: inherit; padding: 5px 12px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(64, 128, 226, .5);
            background: rgba(64, 128, 226, .12); color: #2f6fd0;
            touch-action: manipulation;
        }
        html.dark #ld-collect-bar button { color: #8fc0ff; }
        #ld-collect-bar button:hover { background: rgba(64, 128, 226, .22); }
        #ld-collect-bar #ld-uncollect-btn {
            border-color: rgba(140, 140, 150, .45);
            background: transparent; color: #777;
        }
        html.dark #ld-collect-bar #ld-uncollect-btn { color: #aaa; }

        /* ---------- 收藏夹面板 ---------- */
        #ld-panel-mask {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0, 0, 0, .45);
            display: flex; align-items: center; justify-content: center;
            padding: 16px;
        }
        #ld-panel {
            width: min(560px, 100%); max-height: min(78vh, 700px);
            display: flex; flex-direction: column;
            border-radius: 12px; overflow: hidden;
            background: #2c2c2e; color: #eee;
            box-shadow: 0 18px 60px rgba(0, 0, 0, .5);
            font: 13px/1.5 ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", sans-serif;
        }
        .ld-panel-head {
            display: flex; align-items: center; gap: 10px;
            padding: 12px 14px; border-bottom: 1px solid rgba(255, 255, 255, .1);
            font-size: 14px; font-weight: 600;
        }
        .ld-panel-head span.ld-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ld-panel-head button {
            font: inherit; font-size: 15px; line-height: 1;
            background: transparent; border: 0; color: #bbb; cursor: pointer; padding: 4px 6px;
        }
        .ld-panel-body { flex: 1; overflow-y: auto; padding: 8px 6px; }
        .ld-sync-tag {
            font-size: 11px; font-weight: 400; padding: 2px 7px; border-radius: 999px;
            background: rgba(255, 255, 255, .1); color: #aaa; white-space: nowrap;
        }
        .ld-sync-tag.ok { background: rgba(90, 190, 120, .18); color: #7fd39a; }
        .ld-sync-tag.bad { background: rgba(220, 100, 90, .18); color: #e08a80; }
        .ld-panel-foot {
            padding: 10px 14px; border-top: 1px solid rgba(255, 255, 255, .1);
            font-size: 12px; color: #999;
            display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .ld-panel-foot input {
            flex: 1; min-width: 120px; padding: 6px 9px; border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, .18); background: rgba(0, 0, 0, .25); color: #eee;
            font: inherit;
        }
        .ld-panel-foot button, .ld-newbtn {
            font: inherit; padding: 6px 12px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(255, 255, 255, .2); background: rgba(255, 255, 255, .08); color: #eee;
        }
        .ld-panel-foot button.primary { background: #3f7fdd; border-color: #3f7fdd; }
        .ld-folder { border-radius: 8px; margin: 4px 6px; overflow: hidden; background: rgba(255, 255, 255, .04); }
        .ld-folder-head {
            display: flex; align-items: center; gap: 8px; width: 100%;
            padding: 9px 12px; cursor: pointer; text-align: left;
            background: transparent; border: 0; color: #eee; font: inherit;
        }
        .ld-folder-head:hover { background: rgba(255, 255, 255, .06); }
        .ld-folder-head .ld-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ld-folder-head .ld-count { font-size: 11px; color: #9ad; }
        .ld-folder-head .ld-del {
            font-size: 11px; color: #d98; background: transparent; border: 0; cursor: pointer; padding: 2px 4px;
        }
        .ld-folder-items { padding: 2px 6px 8px; }
        .ld-item {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 8px; border-radius: 6px;
        }
        .ld-item:hover { background: rgba(255, 255, 255, .06); }
        .ld-item a {
            flex: 1; min-width: 0; color: #cfe2ff !important; text-decoration: none;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ld-item a:hover { text-decoration: underline; }
        .ld-item button {
            font: inherit; font-size: 11px; padding: 3px 8px; border-radius: 5px; cursor: pointer;
            border: 1px solid rgba(255, 255, 255, .18); background: transparent; color: #bbb;
        }
        .ld-item button:hover { color: #fff; border-color: rgba(255, 255, 255, .4); }
        .ld-empty { padding: 22px 14px; text-align: center; color: #888; }
        .ld-pick-row {
            display: flex; align-items: center; gap: 10px; width: 100%;
            padding: 10px 14px; margin: 2px 0; border-radius: 8px; cursor: pointer;
            background: transparent; border: 0; color: #eee; font: inherit; text-align: left;
        }
        .ld-pick-row:hover { background: rgba(255, 255, 255, .08); }
        .ld-pick-row .ld-name { flex: 1; }
        .ld-pick-row .ld-count { font-size: 11px; color: #9ad; }

        /* 批量模式底部操作条 */
        #ld-batch-bar {
            position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
            z-index: 99998; display: flex; align-items: center; gap: 14px;
            padding: 10px 16px; border-radius: 10px;
            background: #2c2c2e; color: #fff;
            font: 13px/1.4 ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", sans-serif;
            box-shadow: 0 8px 28px rgba(0, 0, 0, .4);
            max-width: 92vw;
        }
        #ld-batch-bar b { color: #ff9a9a; }
        #ld-batch-bar button {
            font: inherit; padding: 5px 12px; border-radius: 6px; cursor: pointer;
            border: 1px solid #555; background: #3a3a3c; color: #fff;
        }
        #ld-batch-bar button.primary { background: #d9534f; border-color: #d9534f; }
        #ld-batch-bar button:disabled { opacity: .45; cursor: default; }

        /* 拖拽/滑动手势：行本身不拦截竖向滚动，但保留双指缩放 */
        tr.topic-list-item,
        tr[data-topic-id],
        .topic-list-item[data-topic-id] {
            touch-action: pan-y pinch-zoom !important;
        }
        tr.ld-dragging,
        tr.ld-shift { position: relative; z-index: 5; }
        #ld-swipe-hint {
            position: fixed; z-index: 99997; pointer-events: none;
            transform: translateY(-50%);
            padding: 6px 12px; border-radius: 999px;
            font: 600 12px/1.4 ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", sans-serif;
            color: #fff; background: rgba(217, 83, 79, .92);
            box-shadow: 0 4px 16px rgba(0, 0, 0, .35);
            opacity: 0; transition: opacity .12s;
            white-space: nowrap;
        }
        #ld-swipe-hint.armed { background: #d9534f; }
        #ld-swipe-hint.right { background: rgba(70, 130, 90, .92); }
        #ld-swipe-hint.right.armed { background: #3f8f5c; }

        /* 通用提示条 */
        .ld-toast {
            position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%);
            z-index: 99999; max-width: 88vw;
            display: flex; align-items: center; gap: 12px;
            padding: 10px 16px; border-radius: 8px;
            background: #2c2c2e; color: #fff; font-size: 13px; line-height: 1.4;
            box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
            transition: opacity .3s;
        }
        .ld-toast a { color: #7fb8ff !important; cursor: pointer; text-decoration: none; white-space: nowrap; font-weight: 600; }

        /* 帖子详情页：已忽略横幅 */
        #ld-topic-banner {
            display: flex; align-items: center; gap: 12px;
            margin: 8px 0; padding: 10px 14px; border-radius: 8px;
            background: rgba(217, 83, 79, .12);
            border: 1px solid rgba(217, 83, 79, .35);
            color: #b03030; font-size: 13px;
        }
        html.dark #ld-topic-banner { color: #ff9a9a; }
        #ld-topic-banner button {
            font: inherit; padding: 4px 10px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(217, 83, 79, .5); background: transparent; color: inherit;
        }
    `;
    if (typeof GM_addStyle === 'function') GM_addStyle(CSS);
    else {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ============================================================ 存储层
    function storeGet(key, dflt) {
        try {
            const raw = typeof GM_getValue === 'function' ? GM_getValue(key, null) : localStorage.getItem(key);
            return raw === null || raw === undefined || raw === '' ? dflt : raw;
        } catch (e) { return dflt; }
    }
    function storeSet(key, val) {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(key, val);
            else localStorage.setItem(key, val);
        } catch (e) { console.warn(LOG, '写入失败', e); }
    }

    // 结构：id -> 记录时间（ms）。旧版本是逗号串，这里做兼容迁移。
    const MUTED_TTL = 30 * 24 * 3600 * 1000;
    const mutedSet = new Set();
    const mutedAt = {};

    (function loadMuted() {
        const raw = String(storeGet(SKEY_MUTED, ''));
        let ids = {};
        if (raw.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(raw);
                ids = (parsed && parsed.ids) || {};
            } catch (e) { ids = {}; }
        } else {
            // 旧格式：1002,1003,...
            raw.split(',').forEach((id) => {
                if (/^\d+$/.test(id.trim())) ids[id.trim()] = Date.now();
            });
        }
        const now = Date.now();
        Object.keys(ids).forEach((id) => {
            if (!/^\d+$/.test(id)) return;
            const ts = Number(ids[id]) || now;
            if (now - ts > MUTED_TTL) return; // 过期，交给服务端状态
            mutedSet.add(id);
            mutedAt[id] = ts;
        });
        if (mutedSet.size) console.log(LOG, '本地黑名单', mutedSet.size, '条');
        saveMuted(); // 顺手把旧格式迁移、过期项清理落盘
    })();

    function rememberMute(id) {
        mutedSet.add(id);
        mutedAt[id] = Date.now();
        saveMuted();
    }

    function forgetMute(id) {
        mutedSet.delete(id);
        delete mutedAt[id];
        saveMuted();
        // 立即恢复可见：可能正赶上「忽略」的退场定时器，不能只靠下一轮刷新
        const row = rowById(id);
        if (row) {
            delete row.dataset.ldAnim;
            showRow(row);
        }
    }

    function saveMuted() {
        const out = {};
        const ids = Array.from(mutedSet);
        const keep = ids.slice(-3000); // 只保留最近记录，防无限膨胀
        keep.forEach((id) => { out[id] = mutedAt[id] || Date.now(); });
        storeSet(SKEY_MUTED, JSON.stringify({ v: 2, ids: out }));
    }

    let settings;
    try {
        settings = Object.assign(
            {
                autoKeywords: [], autoMute: false, swipe: true, swipeThreshold: 72,
                swipeTip: false, showFab: true, cloudSync: true
            },
            JSON.parse(storeGet(SKEY_SETTINGS, '{}'))
        );
    } catch (e) {
        settings = {
            autoKeywords: [], autoMute: false, swipe: true, swipeThreshold: 72,
            swipeTip: false, showFab: true, cloudSync: true
        };
    }
    function saveSettings() { storeSet(SKEY_SETTINGS, JSON.stringify(settings)); }

    // ============================================================ 收藏夹（数据层）
    // 设计：收藏 = 服务端 Muted(0) + 本地黑名单 + 归属到某个收藏夹。
    // 这样它在 latest / new / unread / 推荐等所有列表里都消失，
    // 只在本脚本的收藏夹面板里出现（点开仍能正常访问帖子）。
    const SKEY_COLLECT = 'ld_collect_v3';
    const DEFAULT_FOLDER = 'inbox';

    let collections = { v: 1, folders: [] };

    (function loadCollections() {
        try {
            const raw = storeGet(SKEY_COLLECT, '');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.folders)) collections = parsed;
            }
        } catch (e) { collections = { v: 1, folders: [] }; }

        if (!Array.isArray(collections.folders) || !collections.folders.length) {
            collections.folders = [
                { id: DEFAULT_FOLDER, name: '默认收藏夹', createdAt: Date.now(), items: [] }
            ];
        }
        collections.folders.forEach((f) => {
            if (!Array.isArray(f.items)) f.items = [];
            if (!f.id) f.id = 'f' + Math.random().toString(36).slice(2, 9);
            if (!f.name) f.name = '未命名';
        });
    })();

    let localRev = 0; // 每次本地改动 +1，用于识别"同步期间被用户操作打断"
    function markLocalMutation() { localRev++; }

    function saveCollections() { storeSet(SKEY_COLLECT, JSON.stringify(collections)); }

    function folderById(id) { return collections.folders.find((f) => f.id === id) || null; }

    function folderOfTopic(topicId) {
        const id = String(topicId);
        for (let i = 0; i < collections.folders.length; i++) {
            const f = collections.folders[i];
            const item = f.items.find((it) => String(it.id) === id);
            if (item) return { folder: f, item };
        }
        return null;
    }

    function totalCollected() {
        return collections.folders.reduce((n, f) => n + f.items.length, 0);
    }

    function ensureFolder(name) {
        const clean = String(name || '').trim().slice(0, 24);
        if (!clean) return null;
        const existing = collections.folders.find((f) => f.name === clean);
        if (existing) return existing;
        const f = {
            id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            name: clean, createdAt: Date.now(), items: []
        };
        collections.folders.push(f);
        markLocalMutation();
        saveCollections();
        return f;
    }

    function removeFolder(folderId) {
        const f = folderById(folderId);
        if (!f || f.id === DEFAULT_FOLDER) return false;
        // 把里面的帖转移到默认收藏夹，不丢数据
        const def = folderById(DEFAULT_FOLDER) || collections.folders[0];
        if (def && def !== f) def.items = f.items.concat(def.items);
        collections.folders = collections.folders.filter((x) => x !== f);
        markLocalMutation();
        saveCollections();
        return true;
    }

    // 在收藏夹之间移动：改书签的 name（服务端），再同步本地
    async function moveToFolder(topicId, folderId) {
        const found = folderOfTopic(topicId);
        const target = folderById(folderId);
        if (!found || !target || found.folder.id === target.id) return false;

        if (settings.cloudSync !== false) {
            try {
                let bmId = found.item && found.item.bookmarkId;
                if (!bmId) {
                    const all = await listAllBookmarks();
                    const hit = all.find(function (b) { return bookmarkTopicId(b) === String(topicId); });
                    bmId = hit && hit.id;
                }
                if (bmId) await renameBookmark(bmId, target.name);
                else { // 云端没有就补一个
                    const bm = await createBookmark(topicId, target.name);
                    found.item.bookmarkId = bm && bm.id;
                }
            } catch (err) {
                toast('移动失败（云端）：' + err.message, { timeout: 7000 });
                return false;
            }
        }

        found.folder.items = found.folder.items.filter(function (it) { return String(it.id) !== String(topicId); });
        target.items.unshift(found.item);
        markLocalMutation();
        saveCollections();
        return true;
    }

    function removeFromAllFolders(topicId) {
        const id = String(topicId);
        let hit = false;
        collections.folders.forEach((f) => {
            const before = f.items.length;
            f.items = f.items.filter((it) => String(it.id) !== id);
            if (f.items.length !== before) hit = true;
        });
        if (hit) { markLocalMutation(); saveCollections(); }
        return hit;
    }

    // ============================================================ 云端同步
    // 以「ld:前缀的书签」作为唯一可信数据源重新构建本地收藏夹；
    // 本地只做缓存（离线可看、加速渲染）。
    const syncState = { pending: false, lastSync: 0, error: '', username: '' };
    const EMPTY_FOLDER_GRACE = 7 * 24 * 3600 * 1000; // 本地空收藏夹保留 7 天

    function bookmarkTopicId(b) {
        const raw = b.topic_id || b.bookmarkable_id || (b.topic && b.topic.id) || '';
        const id = String(raw);
        return /^\d+$/.test(id) ? id : '';
    }

    function bookmarkFolderName(b) {
        const n = String(b.name || '');
        if (n.indexOf(BM_PREFIX) !== 0) return '';
        return n.slice(BM_PREFIX.length).trim();
    }

    async function syncFromCloud(opts) {
        opts = opts || {};
        if (settings.cloudSync === false) return false;
        if (syncState.pending) return false;
        if (!getCsrf()) return false; // 未登录页面（如错误页）直接跳过
        syncState.pending = true;
        const revAtStart = localRev;
        try {
            const all = await listAllBookmarks();
            const ours = all.filter(function (b) { return !!bookmarkFolderName(b); });

            // 1) 按收藏夹名归类云端书签
            const names = [];
            const itemsByFolder = {};
            ours.forEach(function (b) {
                const folderName = bookmarkFolderName(b) || '默认收藏夹';
                const tid = bookmarkTopicId(b);
                if (!tid) return;
                if (!itemsByFolder[folderName]) { itemsByFolder[folderName] = []; names.push(folderName); }
                itemsByFolder[folderName].push({
                    id: tid,
                    title: (b.topic && b.topic.title) || b.title || ('#' + tid),
                    url: '/t/' + tid,
                    addedAt: Date.parse(b.created_at) || Date.now(),
                    bookmarkId: b.id
                });
            });

            // 2) 复用本地文件夹 id / 创建时间，避免面板顺序乱跳
            const byName = {};
            collections.folders.forEach(function (f) { byName[f.name] = f; });

            const folders = [];
            names.forEach(function (n) {
                const old = byName[n];
                folders.push({
                    id: old ? old.id : ('f' + Math.random().toString(36).slice(2, 9)),
                    name: n,
                    createdAt: old ? old.createdAt : Date.now(),
                    items: itemsByFolder[n].sort(function (a, b) { return b.addedAt - a.addedAt; })
                });
                delete byName[n];
            });

            // 3) 默认收藏夹始终保留
            if (!folders.some(function (f) { return f.name === '默认收藏夹'; })) {
                const def = byName['默认收藏夹'];
                folders.unshift({
                    id: def ? def.id : DEFAULT_FOLDER,
                    name: '默认收藏夹',
                    createdAt: def ? def.createdAt : Date.now(),
                    items: []
                });
                delete byName['默认收藏夹'];
            }

            // 4) 本地还空着的收藏夹（已建未用）保留一段时间
            const now = Date.now();
            Object.keys(byName).forEach(function (n) {
                const f = byName[n];
                if (f.items && f.items.length) return;
                if (now - (f.createdAt || 0) > EMPTY_FOLDER_GRACE) return;
                folders.push({ id: f.id, name: f.name, createdAt: f.createdAt, items: [] });
            });

            // 拉取过程中用户做了收藏/移出/移动：这次结果已过期，别覆盖
            if (localRev !== revAtStart) {
                console.log(LOG, '同步结果因本地有更新而丢弃，稍后重试');
                syncState.pending = false;
                setTimeout(function () { syncFromCloud({ silent: true }); }, 1200);
                return false;
            }

            collections = { v: 2, folders: folders };
            saveCollections();

            // 5) 云端收藏的帖子同时在本地列表里隐藏（不再额外发请求）
            ours.forEach(function (b) {
                const tid = bookmarkTopicId(b);
                if (tid && !mutedSet.has(tid)) rememberMute(tid);
            });

            syncState.lastSync = Date.now();
            syncState.username = currentUserCache || String(storeGet('ld_username', '') || '');
            syncState.error = '';
            updateFab();
            renderTopicPage();
            if (!opts.silent) renderPanel();
            refreshView();
            return true;
        } catch (err) {
            syncState.error = err.message || String(err);
            console.warn(LOG, '云端同步失败', err);
            if (!opts.silent) toast('云端同步失败：' + syncState.error, { timeout: 7000 });
            return false;
        } finally {
            syncState.pending = false;
        }
    }

    function topicTitleOnPage() {
        const el = document.querySelector('#topic-title .fancy-title, #topic-title h1, .topic-title h1, h1.fancy-title');
        let t = el ? el.textContent.trim() : '';
        if (!t) t = (document.title || '').replace(/\s*-\s*LINUX DO\s*$/i, '');
        return t.replace(/\s+/g, ' ').slice(0, 160);
    }

    // 收藏：服务端忽略（隐藏） + 写书签（跨设备） + 本地缓存
    async function collectTopic(topicId, title, folderId) {
        const folder = folderById(folderId) || folderById(DEFAULT_FOLDER) || collections.folders[0];
        if (!folder) return false;
        let cloudOk = false;
        let cloudErr = '';

        // 先写书签：这是跨设备的唯一数据源，失败也要让用户知道
        if (settings.cloudSync !== false) {
            try {
                const bm = await createBookmark(topicId, folder.name);
                cloudOk = true;
                folder._bmId = bm && bm.id;
            } catch (err) {
                cloudErr = err.message || String(err);
                console.warn(LOG, '书签写入失败', err);
            }
        } else {
            cloudOk = true; // 主动关闭同步，视为成功
        }

        try {
            await muteOne(topicId); // 服务端 Muted(0) + 本地黑名单 → 各列表不再显示
        } catch (err) {
            toast('收藏失败：' + err.message, { timeout: 7000 });
            return false;
        }

        removeFromAllFolders(topicId);
        folder.items.unshift({
            id: String(topicId),
            title: title || ('#' + topicId),
            url: '/t/' + topicId,
            addedAt: Date.now(),
            bookmarkId: folder._bmId || ''
        });
        delete folder._bmId;
        saveCollections();
        refreshView();
        updateFab();
        renderTopicPage();

        if (cloudOk) {
            toast('已收藏到「' + folder.name + '」，手机端同步可见', {
                action: { label: '打开收藏夹', run: function () { openPanel('browse'); } },
                timeout: 8000
            });
        } else {
            toast('已本地收藏到「' + folder.name + '」，但云端同步失败：' + cloudErr +
                '（手机端将看不到，可稍后在菜单里重试）', { timeout: 9000 });
        }
        return true;
    }

    // 移出：删书签 + 恢复常规 + 出库
    async function uncollectTopic(topicId) {
        const found = folderOfTopic(topicId);
        if (settings.cloudSync !== false) {
            try {
                let bmId = found && found.item && found.item.bookmarkId;
                if (!bmId) {
                    const all = await listAllBookmarks();
                    const hit = all.find(function (b) { return bookmarkTopicId(b) === String(topicId); });
                    bmId = hit && hit.id;
                }
                if (bmId) await deleteBookmark(bmId);
            } catch (err) {
                toast('删除云端书签失败：' + err.message, { timeout: 7000 });
                return false; // 云端没删掉就保留本地状态，避免两端不一致
            }
        }

        try {
            await unmuteOne(topicId); // 服务端 Regular(1) + 移出本地黑名单
        } catch (err) {
            toast('移出失败：' + err.message, { timeout: 7000 });
            return false;
        }
        removeFromAllFolders(topicId);
        saveCollections();
        updateFab();
        renderTopicPage();
        refreshView();
        toast('已移出收藏夹，恢复正常显示');
        return true;
    }

    // ============================================================ 提示条
    let toastEl = null;
    function toast(msg, opts) {
        opts = opts || {};
        // 引导类提示不覆盖用户刚触发的真实反馈（否则会吞掉「撤销」入口）
        if (opts.soft && toastEl && toastEl.isConnected) return;
        if (toastEl) toastEl.remove();
        const el = document.createElement('div');
        el.className = 'ld-toast';
        const span = document.createElement('span');
        span.textContent = msg;
        el.appendChild(span);
        if (opts.action) {
            const a = document.createElement('a');
            a.textContent = opts.action.label;
            a.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                el.remove(); toastEl = null;
                opts.action.run();
            });
            el.appendChild(a);
        }
        document.body.appendChild(el);
        toastEl = el;
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => { if (el.isConnected) el.remove(); if (toastEl === el) toastEl = null; }, 320);
        }, opts.timeout || 5000);
    }

    // ============================================================ API
    function getCsrf() {
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    }

    async function postNotificationLevel(topicId, level) {
        const csrf = getCsrf();
        if (!csrf) throw new Error('缺少 CSRF Token（未登录或页面未加载完）');

        const send = (suffix) => fetch(`/t/${topicId}/notifications${suffix}`, {
            method: 'POST',
            credentials: 'same-origin',
            keepalive: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json, text/plain, */*',
                'X-CSRF-Token': csrf,
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: `notification_level=${level}`
        });

        let res = await send('.json');
        if (res.status === 404) res = await send('');
        return res;
    }

    // 通用 JSON 请求（自动带 CSRF）
    async function apiRequest(path, method, body) {
        const csrf = getCsrf();
        if (!csrf) throw new Error('缺少 CSRF Token（未登录或页面未加载完）');
        const opts = {
            method: method || 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'X-CSRF-Token': csrf,
                'X-Requested-With': 'XMLHttpRequest'
            }
        };
        if (body !== undefined && body !== null) {
            opts.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            opts.body = typeof body === 'string' ? body : Object.keys(body).map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(body[k]);
            }).join('&');
        }
        const res = await fetch(path, opts);
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!res.ok) {
            const detail = data && (data.errors || []).join('；');
            const err = new Error(detail || levelErrorMessage(res.status));
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    function levelErrorMessage(status) {
        if (status === 401) return '401 未登录';
        if (status === 403) return '403 权限或 CSRF 失效，刷新页面重试';
        if (status === 404) return '404 接口路径不对（Discourse 版本差异）';
        if (status === 429) return '429 操作太频繁被限流，稍等再试';
        if (status >= 500) return `${status} 服务器错误`;
        return `HTTP ${status}`;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ============================================================ 书签 API（跨设备载体）
    // Discourse 的书签带 name 字段且存服务端，天然跨设备：
    //   收藏夹名  →  编码进书签 name（前缀 ld:）
    //   帖子归属  →  书签本身（topic 级）
    const BM_PREFIX = 'ld:';
    let currentUserCache = null;

    async function currentUsername() {
        if (currentUserCache) return currentUserCache;
        const cached = String(storeGet('ld_username', '') || '');
        if (cached) { currentUserCache = cached; return cached; }
        const data = await apiRequest('/session/current.json', 'GET');
        const u = data && data.current_user && data.current_user.username;
        if (!u) throw new Error('未登录');
        currentUserCache = u;
        storeSet('ld_username', u);
        return u;
    }

    function forgetUsername() { currentUserCache = null; storeSet('ld_username', ''); }

    // 拉取全部书签；翻页取到没有为止
    async function listAllBookmarks() {
        const username = await currentUsername();
        const out = [];
        const seen = {};
        for (let page = 0; page < 20; page++) {
            const data = await apiRequest('/u/' + encodeURIComponent(username) + '/bookmarks.json?page=' + page, 'GET');
            const rows = (data && data.user_bookmark_list && data.user_bookmark_list.bookmarks) || [];
            if (!rows.length) break;
            let fresh = 0;
            rows.forEach(function (b) {
                const key = String(b.id);
                if (seen[key]) return;
                seen[key] = 1;
                fresh++;
                out.push(b);
            });
            if (!fresh) break;
        }
        return out;
    }

    function bookmarkContainsTopic(b, topicId) {
        const id = String(topicId);
        if (b.topic_id && String(b.topic_id) === id) return true;
        if (b.bookmarkable_id && String(b.bookmarkable_id) === id && /topic/i.test(b.bookmarkable_type || '')) return true;
        if (b.topic && String(b.topic.id) === id) return true;
        return false;
    }

    async function createBookmark(topicId, folderName) {
        const body = {
            bookmarkable_id: String(topicId),
            bookmarkable_type: 'Topic',
            name: BM_PREFIX + folderName
        };
        try {
            const data = await apiRequest('/bookmarks.json', 'POST', body);
            const b = data && (data.id ? data : (data.bookmark || null));
            return b || {};
        } catch (err) {
            // 该帖已被收藏（可能是用户自己加的，也可能是本脚本旧记录）：改成改名
            if (err.status === 400 || /already|已收藏|bookmarked/i.test(err.message)) {
                const all = await listAllBookmarks();
                const hit = all.find(function (b) { return bookmarkContainsTopic(b, topicId); });
                if (hit && hit.id) {
                    await apiRequest('/bookmarks/' + hit.id, 'PUT', { name: BM_PREFIX + folderName });
                    return { id: hit.id };
                }
            }
            throw err;
        }
    }

    async function deleteBookmark(bookmarkId) {
        await apiRequest('/bookmarks/' + bookmarkId, 'DELETE');
    }

    async function renameBookmark(bookmarkId, folderName) {
        await apiRequest('/bookmarks/' + bookmarkId, 'PUT', { name: BM_PREFIX + folderName });
    }

    // 同一个 topic 的请求串成队列：网络慢时「撤销」不会超车到「忽略」前面，
    // 从而不会出现「已经撤销、界面却还被隐藏」的错乱。
    const topicChain = new Map();

    function withTopicLock(topicId, fn) {
        const prev = topicChain.get(topicId) || Promise.resolve();
        const run = prev.then(fn, fn);
        topicChain.set(topicId, run.then(() => {}, () => {}));
        run.finally(() => { if (topicChain.get(topicId) === run) topicChain.delete(topicId); });
        return run;
    }

    function muteOne(topicId) {
        return withTopicLock(topicId, async () => {
            const res = await postNotificationLevel(topicId, 0); // 0 = Muted
            if (!res.ok) throw new Error(levelErrorMessage(res.status));
            rememberMute(topicId);
        });
    }

    function unmuteOne(topicId) {
        return withTopicLock(topicId, async () => {
            const res = await postNotificationLevel(topicId, 1); // 1 = Regular
            if (!res.ok) throw new Error(levelErrorMessage(res.status));
            forgetMute(topicId);
        });
    }

    // ============================================================ 行操作
    // 探测 tr 上的 transform 是否真的生效：不生效就改用 position:relative + left
    const ROW_SHIFT_MODE = (function () {
        try {
            const probe = document.createElement('tr');
            probe.className = 'topic-list-item';
            probe.style.cssText = 'position:absolute;left:0;top:-2000px;width:20px;height:10px;';
            document.body.appendChild(probe);
            const before = probe.getBoundingClientRect().left;
            probe.style.transform = 'translateX(-40px)';
            const after = probe.getBoundingClientRect().left;
            probe.remove();
            const ok = Math.abs(after - before) > 1;
            if (!ok) console.log(LOG, '当前浏览器不支持 tr 的 transform，已启用 left 降级');
            return ok ? 'transform' : 'left';
        } catch (e) { return 'transform'; }
    })();

    // 统一的行水平位移写法（拖动跟手、退场滑出、回弹都走这里）
    function setShift(row, px) {
        if (ROW_SHIFT_MODE === 'left') {
            if (row.style.transform) row.style.transform = '';
            const v = px ? `${Math.round(px)}px` : '';
            if (row.style.left !== v) row.style.left = v;
        } else {
            if (row.style.left) row.style.left = '';
            const v = px ? `translateX(${Math.round(px)}px)` : '';
            if (row.style.transform !== v) row.style.transform = v;
        }
    }

    function clearDragStyle(row) {
        if (row.style.transform) row.style.transform = '';
        if (row.style.left) row.style.left = '';
        if (row.style.opacity) row.style.opacity = '';
        if (row.style.transition) row.style.transition = '';
        if (row.style.willChange) row.style.willChange = '';
        if (row.style.userSelect) row.style.userSelect = '';
        if (row.style.webkitUserSelect) row.style.webkitUserSelect = '';
    }

    function hideRow(row) {
        row.classList.add('ld-muted-row');
        row.classList.remove('ld-dragging', 'ld-hot', 'ld-selected', 'ld-shift');
        if (row.style.display !== 'none') row.style.display = 'none';
        clearDragStyle(row);
    }

    function showRow(row) {
        // 行被 Ember 复用/撤销后，必须清掉上次拖动留下的内联样式
        if (row.classList.contains('ld-muted-row') || row.style.display === 'none') {
            row.classList.remove('ld-muted-row');
            row.style.display = '';
        }
        clearDragStyle(row);
    }

    // 正在拖拽 / 正在播放退场动画的行，任何自动刷新都不许动
    function isBusyRow(row) {
        if (row.classList.contains('ld-dragging')) return true;
        if (row.dataset.ldAnim === 'out') return true;
        if (swipe.row === row && (swipe.active || swipe.locked)) return true;
        return false;
    }

    function rowById(id) {
        return document.querySelector('[data-topic-id="' + id + '"]');
    }

    function rowId(row) {
        const id = String(row.getAttribute('data-topic-id') || '');
        return /^\d+$/.test(id) ? id : '';
    }

    function rowTitle(row) {
        const a = row.querySelector('a.title, .link-top-line a, .main-link a');
        return a ? (a.textContent || '').trim() : '';
    }

    // 按钮挂到最后一个 td，绝不塞进标题 <a>，避免点击触发跳转
    function pickHost(row) {
        const tds = row.querySelectorAll('td');
        if (tds.length) return tds[tds.length - 1];
        // 移动端部分模板用 div 容器
        return row.querySelector('.topic-list-data, .right, .posters')
            || row.querySelector('.link-top-line, .main-link')
            || row;
    }

    // ============================================================ 撤销栈
    const undoStack = []; // 每项是一组 topicId
    function pushUndo(ids) {
        if (!ids.length) return;
        undoStack.push(ids.slice());
        if (undoStack.length > 30) undoStack.shift();
    }
    async function undoLast() {
        const group = undoStack.pop();
        if (!group) { toast('没有可撤销的忽略操作'); return; }
        let ok = 0, fail = 0;
        for (const id of group) {
            try { await unmuteOne(id); ok++; }
            catch (e) { fail++; console.warn(LOG, '撤销失败', id, e); }
            await sleep(250);
        }
        refreshView();
        toast(fail ? `已恢复 ${ok} 条，${fail} 条失败` : `已恢复 ${ok} 条为「常规」`);
    }

    // ============================================================ 批量模式
    const batch = { on: false, ids: new Set(), bar: null };

    function batchBar() {
        if (batch.bar && batch.bar.isConnected) return batch.bar;
        const el = document.createElement('div');
        el.id = 'ld-batch-bar';
        el.innerHTML = '<span id="ld-batch-count"></span>' +
            '<button id="ld-batch-go" class="primary">忽略所选</button>' +
            '<button id="ld-batch-clear">清空</button>' +
            '<button id="ld-batch-exit">退出</button>';
        document.body.appendChild(el);
        el.querySelector('#ld-batch-go').addEventListener('click', () => muteBatch());
        el.querySelector('#ld-batch-clear').addEventListener('click', () => {
            batch.ids.clear(); syncSelection(); updateBatchBar();
        });
        el.querySelector('#ld-batch-exit').addEventListener('click', () => setBatch(false));
        batch.bar = el;
        return el;
    }

    function updateBatchBar() {
        if (!batch.on) { if (batch.bar) batch.bar.remove(); batch.bar = null; return; }
        const el = batchBar();
        el.querySelector('#ld-batch-count').innerHTML =
            `批量忽略中：已选 <b>${batch.ids.size}</b> 条 · 点击帖子标题行选择 · Esc 退出`;
        el.querySelector('#ld-batch-go').disabled = batch.ids.size === 0;
    }

    function syncSelection() {
        document.querySelectorAll('tr.topic-list-item, .topic-list-item[data-topic-id]').forEach((row) => {
            const id = rowId(row);
            if (id && batch.ids.has(id)) row.classList.add('ld-selected');
            else row.classList.remove('ld-selected');
        });
    }

    function setBatch(on) {
        batch.on = on;
        if (!on) { batch.ids.clear(); }
        document.body.classList.toggle('ld-batch-mode', on);
        syncSelection();
        updateBatchBar();
    }

    async function muteBatch() {
        const ids = Array.from(batch.ids);
        if (!ids.length) return;
        const bar = batch.bar;
        const go = bar && bar.querySelector('#ld-batch-go');
        if (go) { go.disabled = true; go.textContent = '处理中…'; }
        let ok = 0, fail = 0, msg = '';
        const done = [];
        for (const id of ids) {
            try { await muteOne(id); ok++; done.push(id); }
            catch (e) {
                fail++; msg = e.message;
                if (/429/.test(e.message)) { msg = '429 限流，已停止剩余 ' + (ids.length - ok - fail) + ' 条'; break; }
            }
            await sleep(400);
        }
        pushUndo(done);
        refreshView();
        if (go) { go.textContent = '忽略所选'; }
        toast(fail ? `成功 ${ok} 条，失败 ${fail} 条（${msg}）` : `已忽略 ${ok} 条帖子`,
            { action: { label: '撤销', run: undoLast } });
        if (!fail) setBatch(false); else updateBatchBar();
    }

    // ============================================================ 单个忽略
    async function muteTopic(topicId, btn) {
        if (btn) { btn.classList.add('is-busy'); btn.textContent = '…'; }
        try {
            await muteOne(topicId);
            pushUndo([topicId]);
            refreshView();
            toast('已忽略该帖（账号级同步）', {
                action: { label: '撤销', run: undoLast },
                timeout: 6000
            });
            return true;
        } catch (err) {
            if (btn) { btn.classList.remove('is-busy'); btn.textContent = '✕'; }
            console.warn(LOG, '忽略失败', err);
            toast(`忽略失败：${err.message}`, { timeout: 7000 });
            return false;
        }
    }

    // ============================================================ 详情页支持
    function currentTopicId() {
        const m = location.pathname.match(/^\/t\/(?:[^/]+\/)?(\d+)/);
        return m ? m[1] : '';
    }

    function topicPageMount() {
        const id = currentTopicId();
        if (!id) return;
        const titleArea = document.querySelector('#topic-title, .topic-title, #topic .title');
        if (!titleArea) return;

        let banner = document.getElementById('ld-topic-banner');
        renderTopicPage();

        if (folderOfTopic(id)) {
            // 已收进收藏夹：由收藏条表达状态，不再显示「已忽略」
            if (banner) banner.remove();
            return;
        }
        if (mutedSet.has(id)) {
            if (banner) return;
            banner = document.createElement('div');
            banner.id = 'ld-topic-banner';
            banner.innerHTML = '<span>该帖已被你忽略（Muted）</span>';
            const btn = document.createElement('button');
            btn.textContent = '恢复为「常规」';
            btn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                try {
                    await unmuteOne(id);
                    banner.remove();
                    toast('已恢复为「常规」');
                } catch (err) { toast(`恢复失败：${err.message}`); }
            });
            banner.appendChild(btn);
            titleArea.parentElement ? titleArea.parentElement.insertBefore(banner, titleArea.nextSibling)
                : titleArea.insertBefore(banner, null);
        }
    }

    function muteCurrentTopicAndBack() {
        const id = currentTopicId();
        if (!id) return false;
        muteTopic(id).then((ok) => {
            // 请求失败必须留在原页，否则用户以为已忽略、帖子却还在
            if (!ok) return;
            let back = false;
            try {
                back = document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1;
            } catch (e) { back = false; }
            if (back) history.back();
            else location.href = '/latest';
        });
        return true;
    }

    // ============================================================ 收藏夹（界面）
    let panelEl = null;
    let panelMode = 'browse';     // 'browse' | 'pick'
    let panelTopic = null;        // pick 模式下的 { id, title }
    let panelOpenFolders = {};    // browse 模式下展开的收藏夹
    let panelNewInput = null;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function closePanel() {
        if (panelEl && panelEl.isConnected) panelEl.remove();
        panelEl = null;
        panelTopic = null;
        panelNewInput = null;
    }

    function openPanel(mode, topic) {
        panelMode = mode || 'browse';
        panelTopic = topic || null;
        if (panelEl && panelEl.isConnected) { renderPanel(); return; }
        panelEl = el('div');
        panelEl.id = 'ld-panel-mask';
        panelEl.addEventListener('click', function (e) { if (e.target === panelEl) closePanel(); });
        panelEl.appendChild(el('div')).id = 'ld-panel';
        document.body.appendChild(panelEl);
        renderPanel();
    }

    function renderPanel() {
        if (!panelEl || !panelEl.isConnected) return;
        const box = panelEl.querySelector('#ld-panel');
        box.textContent = '';
        panelNewInput = null;

        // ---- 头部
        const head = el('div', 'ld-panel-head');
        const title = el('span', 'ld-grow');
        if (panelMode === 'pick' && panelTopic) {
            const t = panelTopic.title || ('#' + panelTopic.id);
            title.textContent = '收藏「' + (t.length > 22 ? t.slice(0, 22) + '…' : t) + '」到';
        } else {
            title.textContent = '我的收藏夹（' + totalCollected() + '）';
        }
        if (settings.cloudSync === false) {
            const tag = el('span', 'ld-sync-tag', '仅本地');
            tag.title = '云端同步已关闭：换设备看不到这些收藏';
            head.appendChild(tag);
        } else if (syncState.pending) {
            const tag = el('span', 'ld-sync-tag', '同步中…');
            head.appendChild(tag);
        } else if (syncState.error) {
            const tag = el('span', 'ld-sync-tag bad', '同步失败');
            tag.title = syncState.error;
            head.appendChild(tag);
        } else if (syncState.lastSync) {
            const tag = el('span', 'ld-sync-tag ok', '云端已同步');
            tag.title = '账号：' + (syncState.username || '未知') + ' · ' +
                new Date(syncState.lastSync).toLocaleTimeString();
            head.appendChild(tag);
        }
        head.appendChild(title);
        if (panelMode === 'pick') {
            const back = el('button', '', '返回');
            back.addEventListener('click', function () { panelMode = 'browse'; renderPanel(); });
            head.appendChild(back);
        }
        const close = el('button', '', '✕');
        close.title = '关闭（Esc）';
        close.addEventListener('click', closePanel);
        head.appendChild(close);
        box.appendChild(head);

        // ---- 主体
        const body = el('div', 'ld-panel-body');
        box.appendChild(body);

        if (panelMode === 'pick') renderPickBody(body);
        else renderBrowseBody(body);

        // ---- 底部（新建收藏夹）
        const foot = el('div', 'ld-panel-foot');
        if (panelMode === 'pick') {
            foot.appendChild(el('span', '', '新收藏夹名：'));
        } else {
            foot.appendChild(el('span', '', '新建：'));
        }
        const input = el('input');
        input.type = 'text';
        input.placeholder = '例如：教程 / 待读 / 羊毛';
        input.maxLength = 24;
        panelNewInput = input;
        foot.appendChild(input);

        const addBtn = el('button', 'primary', panelMode === 'pick' ? '新建并收藏' : '新建收藏夹');
        addBtn.addEventListener('click', function () { submitNewFolder(input.value); });
        foot.appendChild(addBtn);

        if (panelMode === 'browse' && settings.cloudSync !== false) {
            const syncBtn = el('button', '', '刷新云端');
            syncBtn.title = '从服务器重新拉取收藏夹（换设备后点这个）';
            syncBtn.addEventListener('click', function () {
                syncBtn.disabled = true;
                syncBtn.textContent = '同步中…';
                syncFromCloud({ silent: true }).then(function (ok) {
                    if (!ok) toast('同步失败：' + (syncState.error || '未知错误'), { timeout: 7000 });
                    else toast('已从云端同步（' + totalCollected() + ' 条）');
                    renderPanel();
                });
            });
            foot.appendChild(syncBtn);
        }

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submitNewFolder(input.value); }
            if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
            e.stopPropagation();
        });
        box.appendChild(foot);

        if (panelMode === 'browse' && totalCollected() === 0) {
            // 空态时把焦点给输入框，方便直接新建
            setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
        }
    }

    function submitNewFolder(name) {
        const folder = ensureFolder(name);
        if (!folder) { toast('请输入收藏夹名称'); return; }
        if (panelMode === 'pick' && panelTopic) {
            collectTopic(panelTopic.id, panelTopic.title, folder.id);
            closePanel();
        } else {
            panelOpenFolders[folder.id] = true;
            renderPanel();
            toast('已创建收藏夹「' + folder.name + '」');
        }
    }

    function renderPickBody(body) {
        const moving = !!(panelTopic && panelTopic.moveItem);
        const current = panelTopic ? folderOfTopic(panelTopic.id) : null;

        collections.folders.forEach(function (f) {
            const row = el('button', 'ld-pick-row');
            row.appendChild(el('span', 'ld-name', f.name));
            if (current && current.folder.id === f.id) row.appendChild(el('span', 'ld-count', '当前'));
            else row.appendChild(el('span', 'ld-count', String(f.items.length)));

            row.addEventListener('click', function () {
                if (!panelTopic) return;
                if (moving) {
                    const tid = panelTopic.id;
                    row.disabled = true;
                    moveToFolder(tid, f.id).then(function (ok) {
                        if (!ok) { row.disabled = false; return; }
                        closePanel();
                        updateFab();
                        toast('已移动到「' + f.name + '」');
                    });
                } else {
                    const t = panelTopic;
                    closePanel();
                    collectTopic(t.id, t.title, f.id);
                }
            });
            body.appendChild(row);
        });
    }

    function renderBrowseBody(body) {
        if (!collections.folders.length) {
            body.appendChild(el('div', 'ld-empty', '还没有收藏夹'));
            return;
        }
        collections.folders.forEach(function (f) {
            const wrap = el('div', 'ld-folder');
            const isOpen = !!panelOpenFolders[f.id];

            const head = el('div', 'ld-folder-head');
            head.appendChild(el('span', '', isOpen ? '▾' : '▸'));
            head.appendChild(el('span', 'ld-name', f.name));
            head.appendChild(el('span', 'ld-count', String(f.items.length)));
            head.addEventListener('click', function () {
                panelOpenFolders[f.id] = !panelOpenFolders[f.id];
                renderPanel();
            });
            if (f.id !== DEFAULT_FOLDER) {
                const del = el('button', 'ld-del', '删除');
                del.title = '删除收藏夹（里面的帖子会转入默认收藏夹）';
                del.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!window.confirm('删除收藏夹「' + f.name + '」？里面的 ' + f.items.length + ' 个帖子会转入默认收藏夹。')) return;
                    removeFolder(f.id);
                    delete panelOpenFolders[f.id];
                    renderPanel();
                    toast('已删除收藏夹「' + f.name + '」');
                });
                head.appendChild(del);
            }
            wrap.appendChild(head);

            if (isOpen) {
                const items = el('div', 'ld-folder-items');
                if (!f.items.length) {
                    items.appendChild(el('div', 'ld-empty', '这里还没有帖子'));
                } else {
                    f.items.forEach(function (it) {
                        const row = el('div', 'ld-item');
                        const a = el('a', '', it.title || ('#' + it.id));
                        a.href = it.url || ('/t/' + it.id);
                        row.appendChild(a);

                        const open = el('button', '', '打开');
                        open.addEventListener('click', function (e) {
                            e.stopPropagation();
                            closePanel();
                            location.href = it.url || ('/t/' + it.id);
                        });
                        row.appendChild(open);

                        const rm = el('button', '', '移出');
                        rm.addEventListener('click', function (e) {
                            e.stopPropagation();
                            uncollectTopic(it.id);
                            renderPanel();
                        });
                        row.appendChild(rm);

                        const mv = el('button', '', '移动');
                        mv.addEventListener('click', function (e) {
                            e.stopPropagation();
                            panelTopic = { id: it.id, title: it.title, moveItem: true };
                            panelMode = 'pick';
                            renderPanel();
                        });
                        row.appendChild(mv);

                        items.appendChild(row);
                    });
                }
                wrap.appendChild(items);
            }
            body.appendChild(wrap);
        });
    }

    // ---------------------------------------------------- 悬浮入口
    function updateFab() {
        if (settings.showFab === false) {
            const old = document.getElementById('ld-fab');
            if (old) old.remove();
            return;
        }
        let fab = document.getElementById('ld-fab');
        if (!fab) {
            fab = el('button');
            fab.id = 'ld-fab';
            fab.title = '我的收藏夹（Shift+C）';
            fab.appendChild(el('span', '', '📁'));
            const cnt = el('span', '', '');
            cnt.id = 'ld-fab-count';
            fab.appendChild(cnt);
            fab.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                openPanel('browse');
            });
            document.body.appendChild(fab);
        }
        const n = totalCollected();
        const cnt = fab.querySelector('#ld-fab-count');
        if (cnt) cnt.textContent = n ? String(n) : '';
        fab.classList.toggle('has-items', n > 0);
    }

    // ---------------------------------------------------- 帖子页操作条
    function renderTopicPage() {
        const id = currentTopicId();
        if (!id) return;
        const host = document.querySelector('#topic-title, .topic-title');
        if (!host) return;

        let bar = document.getElementById('ld-collect-bar');
        if (!bar) {
            bar = el('div');
            bar.id = 'ld-collect-bar';

            const btn = el('button');
            btn.id = 'ld-collect-btn';
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                const tid = currentTopicId();
                if (!tid) return;
                if (folderOfTopic(tid)) { openPanel('browse'); return; }
                openPanel('pick', { id: tid, title: topicTitleOnPage() });
            });
            bar.appendChild(btn);

            const out = el('button');
            out.id = 'ld-uncollect-btn';
            out.textContent = '移出收藏夹';
            out.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                const tid = currentTopicId();
                if (tid) uncollectTopic(tid);
            });
            bar.appendChild(out);

            if (host.parentElement) host.parentElement.insertBefore(bar, host.nextSibling);
            else host.appendChild(bar);
        }

        const found = folderOfTopic(id);
        const btn = bar.querySelector('#ld-collect-btn');
        const out = bar.querySelector('#ld-uncollect-btn');
        if (btn) btn.textContent = found ? ('📁 已收藏到「' + found.folder.name + '」') : '📁 收藏到收藏夹';
        if (out) out.style.display = found ? '' : 'none';
    }

    // ============================================================ 关键词规则
    const keywordDone = new Set();

    function matchKeyword(title) {
        const list = settings.autoKeywords || [];
        const t = title.toLowerCase();
        return list.find((k) => k && t.includes(String(k).toLowerCase())) || '';
    }

    // 串行队列：一次只发一个请求，间隔 600ms；被限流就停手，避免刷爆 429
    const kwQueue = [];
    let kwBusy = false;
    let kwHandled = 0;

    function applyKeywordRules(row, id, title) {
        if (!settings.autoMute || !title) return false;
        if (keywordDone.has(id) || kwHandled >= 20) return false;
        const hit = matchKeyword(title);
        if (!hit) return false;
        if (keywordDone.size > 2000) keywordDone.clear(); // 长会话下别无限增长
        keywordDone.add(id);
        kwQueue.push({ id, title, hit });
        pumpKeywordQueue();
        return true;
    }

    async function pumpKeywordQueue() {
        if (kwBusy) return;
        kwBusy = true;
        try {
            while (kwQueue.length) {
                const job = kwQueue.shift();
                kwHandled++;
                try {
                    await muteOne(job.id);
                    const row = rowById(job.id);
                    if (row) hideRow(row);
                    console.log(LOG, '关键词命中自动忽略:', job.hit, job.title);
                    toast(`命中关键词「${job.hit}」，已自动忽略：${job.title.slice(0, 24)}`,
                        { action: { label: '撤销', run: () => { unmuteOne(job.id).then(refreshView).catch(() => {}); } } });
                } catch (e) {
                    console.warn(LOG, '关键词自动忽略失败', job.id, e);
                    if (/429/.test(e.message)) {
                        kwQueue.length = 0;
                        toast('关键词自动忽略被限流，已暂停本页后续自动处理');
                        break;
                    }
                }
                await sleep(600);
            }
        } finally { kwBusy = false; }
    }

    // ============================================================ 列表处理
    function processTopics() {
        const rows = document.querySelectorAll('tr.topic-list-item, .topic-list-item[data-topic-id]');

        rows.forEach((row) => {
            const id = rowId(row);
            if (!id) return;

            // 正在拖拽 / 正在退场：交给手势逻辑自己收尾，别从中打断
            if (isBusyRow(row)) return;

            // 关键词规则先跑（放在早退之前，后开的自动忽略也能生效）
            applyKeywordRules(row, id, rowTitle(row));

            if (mutedSet.has(id)) { hideRow(row); return; }
            showRow(row);

            const existing = row.querySelector('.ld-x');
            if (existing) {
                // Ember 复用行：按钮还在但归属 id 变了 → 拆掉重建
                if (existing.dataset.topicId === id) return;
                existing.remove();
            }

            const host = pickHost(row);
            if (!host) return;

            const btn = document.createElement('span');
            btn.className = 'ld-x';
            btn.dataset.topicId = id;
            btn.textContent = '✕';
            btn.title = '忽略此帖（鼠标悬停该行按 X，或点这里）';

            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (batch.on) return;
                const liveRow = btn.closest('[data-topic-id]');
                const liveId = liveRow && rowId(liveRow);
                if (liveId) muteTopic(liveId, btn);
            });
            btn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });

            host.appendChild(btn);

            // 标题链接 Alt/Option + 点击 = 直接忽略
            const titleLink = row.querySelector('a.title, .link-top-line a');
            if (titleLink && !titleLink.dataset.ldAlt) {
                titleLink.dataset.ldAlt = '1';
                titleLink.draggable = false; // 否则鼠标横向拖拽会触发原生链接拖动幽灵图
                titleLink.addEventListener('click', (e) => {
                    if (!e.altKey || e.metaKey || e.ctrlKey) return;
                    e.preventDefault(); e.stopPropagation();
                    const liveRow = titleLink.closest('[data-topic-id]');
                    const liveId = liveRow && rowId(liveRow);
                    if (liveId) muteTopic(liveId);
                }, true);
            }

        });

        // 搜索结果/fps-result 之类不是 <tr> 结构，只做隐藏，不注入按钮
        document.querySelectorAll('.fps-result[data-topic-id], .search-result[data-topic-id], .topic-list-item[data-topic-id]').forEach((node) => {
            if (node.tagName === 'TR') return; // 上面的循环已处理
            const id = rowId(node);
            if (!id) return;
            if (mutedSet.has(id)) node.classList.add('ld-muted-row');
            else node.classList.remove('ld-muted-row');
        });

        topicPageMount();
    }

    // ============================================================ 滑动手势
    // 左滑 → 忽略；右滑 → 撤销上一条忽略。
    // 触摸走 touch* 事件并在锁定方向后 preventDefault（防止被 pointercancel 打断），
    // 鼠标 / 触控笔走 Pointer Events。
    const ROW_SEL = 'tr.topic-list-item, .topic-list-item[data-topic-id]';

    const swipe = {
        active: false,
        locked: false,
        row: null,
        id: '',
        x0: 0,
        y0: 0,
        dx: 0,
        pointerId: null,
        armed: false,
        kind: ''          // 'touch' | 'pointer'
    };
    let suppressClickUntil = 0;

    function swipeThresholdFor(row) {
        const w = row.getBoundingClientRect().width || 400;
        const base = Number(settings.swipeThreshold) || 72;
        return Math.max(44, Math.min(base, w * 0.4));
    }

    let hintEl = null;
    function swipeHintEl() {
        if (!hintEl || !hintEl.isConnected) {
            hintEl = document.createElement('div');
            hintEl.id = 'ld-swipe-hint';
            document.body.appendChild(hintEl);
        }
        return hintEl;
    }

    function paintHint(row, dx) {
        const el = swipeHintEl();
        const armed = Math.abs(dx) >= swipeThresholdFor(row);
        // 越过阈值时轻微震动一次，手机上不用盯屏幕
        if (armed && !swipe.armed) {
            swipe.armed = true;
            try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* ignore */ }
        } else if (!armed) {
            swipe.armed = false;
        }
        const left = dx < 0;
        el.className = (left ? 'left' : 'right') + (armed ? ' armed' : '');
        el.textContent = left
            ? (armed ? '松手忽略' : '← 忽略')
            : (armed ? '松手撤销' : '撤销 →');
        const r = row.getBoundingClientRect();
        el.style.top = `${r.top + r.height / 2}px`;
        el.style.left = left ? `${Math.max(10, r.right - 130)}px` : `${Math.min(window.innerWidth - 130, r.left + 10)}px`;
        el.style.opacity = String(Math.min(1, Math.abs(dx) / 36));
    }

    function clearHint() {
        if (hintEl && hintEl.isConnected) hintEl.style.opacity = '0';
    }

    function resetDrag() {
        const row = swipe.row;
        if (row && row.isConnected && !row.classList.contains('ld-muted-row')) {
            row.style.transition = 'transform .18s ease-out, opacity .18s, left .18s ease-out';
            setShift(row, 0);
            row.style.opacity = '';
            setTimeout(() => {
                if (!row.isConnected) return;
                row.style.transition = '';
                row.style.willChange = '';
                row.style.userSelect = '';
                row.style.webkitUserSelect = '';
                row.classList.remove('ld-shift');
            }, 200);
        }
        if (row) row.classList.remove('ld-dragging');
        swipe.active = false;
        swipe.locked = false;
        swipe.row = null;
        swipe.id = '';
        swipe.dx = 0;
        swipe.pointerId = null;
        swipe.armed = false;
        swipe.kind = '';
        clearHint();
    }

    // 起手：记录起点，先不改任何东西（保证竖向滚动不受影响）
    function beginDrag(row, id, x, y, kind, pointerId) {
        swipe.active = true;
        swipe.locked = false;
        swipe.row = row;
        swipe.id = id;
        swipe.x0 = x;
        swipe.y0 = y;
        swipe.dx = 0;
        swipe.pointerId = pointerId === undefined ? null : pointerId;
        swipe.kind = kind;
        swipe.armed = false;
    }

    // 移动：方向锁 + 位移跟手。preventScroll 只在触摸锁定后调用
    function moveDrag(x, y, preventScroll) {
        const dx = x - swipe.x0;
        const dy = y - swipe.y0;

        if (!swipe.locked) {
            if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
            // 竖向为主 → 交还给页面滚动
            if (Math.abs(dy) > Math.abs(dx) * 1.15) { resetDrag(); return; }
            if (Math.abs(dx) < 10) return;
            swipe.locked = true;
            swipe.row.classList.add('ld-dragging', 'ld-shift');
            swipe.row.style.transition = 'none';
            swipe.row.style.willChange = 'transform';
            swipe.row.style.userSelect = 'none';
            swipe.row.style.webkitUserSelect = 'none';
        }

        if (preventScroll) preventScroll(); // 锁定后阻止浏览器抢走手势
        swipe.dx = dx;
        const row = swipe.row;
        const w = row.getBoundingClientRect().width || 400;
        const tx = Math.max(-w * 0.92, Math.min(w * 0.92, dx));
        setShift(row, tx);
        paintHint(row, dx);
    }

    // 松手：按位移决定执行还是回弹
    function commitDrag() {
        const row = swipe.row;
        const id = swipe.id;
        const locked = swipe.locked;
        const dx = swipe.dx;
        if (!row || !locked) { resetDrag(); return; }

        if (Math.abs(dx) < swipeThresholdFor(row)) { resetDrag(); return; }

        suppressClickUntil = Date.now() + 500; // 拖完松手不要触发标题跳转
        swipe.active = false;
        swipe.locked = false;
        swipe.row = null;
        swipe.id = '';
        swipe.pointerId = null;
        swipe.armed = false;
        swipe.kind = '';
        clearHint();

        if (dx < 0) swipeMuteRow(row, id);
        else swipeUndo(row);
    }

    async function swipeMuteRow(row, id) {
        const w = row.getBoundingClientRect().width || 400;
        row.classList.remove('ld-dragging');
        row.dataset.ldAnim = 'out'; // 锁定：这段时间内的自动刷新不要碰这行
        row.style.willChange = '';
        row.classList.add('ld-shift');
        row.style.transition = 'transform .22s ease-in, opacity .22s, left .22s ease-in';
        setShift(row, -w);
        row.style.opacity = '.2';
        try {
            await muteOne(id);
            if (!mutedSet.has(id)) { // 等待期间已被撤销
                delete row.dataset.ldAnim;
                resetDragOf(row);
                return;
            }
            pushUndo([id]);
            setTimeout(() => {
                delete row.dataset.ldAnim;
                if (!row.isConnected) return;
                // 期间可能已被撤销：以真实状态收尾，不能盲目隐藏
                if (mutedSet.has(id)) hideRow(row);
                else showRow(row);
            }, 210);
            toast('已忽略该帖（账号级同步）', {
                action: { label: '撤销', run: undoLast },
                timeout: 6000
            });
        } catch (err) {
            delete row.dataset.ldAnim;
            resetDragOf(row);
            toast(`忽略失败：${err.message}`, { timeout: 7000 });
        }
    }

    function resetDragOf(row) {
        if (!row || !row.isConnected) return;
        delete row.dataset.ldAnim;
        row.style.transition = 'transform .2s ease-out, opacity .2s, left .2s ease-out';
        setShift(row, 0);
        row.style.opacity = '';
        setTimeout(() => {
            if (!row.isConnected) return;
            row.style.transition = '';
            row.style.willChange = '';
            row.style.userSelect = '';
            row.style.webkitUserSelect = '';
            row.classList.remove('ld-shift');
        }, 220);
    }

    async function swipeUndo(row) {
        resetDragOf(row);
        if (!undoStack.length) { toast('没有可撤销的忽略操作'); return; }
        await undoLast();
    }

    // ---------------------------------------------------- 触摸链路（手机）
    function touchRowOf(target) {
        return target && target.closest ? target.closest(ROW_SEL) : null;
    }

    function onTouchStart(e) {
        if (!settings.swipe || batch.on) return;
        if (e.touches.length !== 1) { if (swipe.active) resetDrag(); return; }
        if (isTyping(e) || modalOpen()) return;
        const row = touchRowOf(e.target);
        if (!row) return;
        const id = rowId(row);
        if (!id) return;
        if (row.dataset.ldAnim === 'out' || mutedSet.has(id)) return;
        const t = e.touches[0];
        // 屏幕边缘留给系统手势（返回/侧滑）
        if (t.clientX < 26 || t.clientX > window.innerWidth - 26) return;
        beginDrag(row, id, t.clientX, t.clientY, 'touch', null);
    }

    function onTouchMove(e) {
        if (!swipe.active || swipe.kind !== 'touch' || !e.touches.length) return;
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY, () => {
            // 只在已经判定为横向滑动后调用，竖向滚动完全不受影响
            if (e.cancelable) e.preventDefault();
        });
    }

    function onTouchEnd(e) {
        if (swipe.kind !== 'touch') return;
        commitDrag();
    }

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', () => { if (swipe.kind === 'touch') resetDrag(); }, { capture: true, passive: true });

    // ---------------------------------------------------- 鼠标 / 触控笔链路
    function onPointerDown(e) {
        if (e.pointerType === 'touch') return;         // 触摸交给上面的链路
        if (!settings.swipe || batch.on) return;
        if (e.button !== 0) return;
        if (isTyping(e) || modalOpen()) return;
        const row = e.target && e.target.closest ? e.target.closest(ROW_SEL) : null;
        if (!row) return;
        const id = rowId(row);
        if (!id) return;
        if (row.dataset.ldAnim === 'out' || mutedSet.has(id)) return;
        if (e.clientX < 26 || e.clientX > window.innerWidth - 26) return;
        beginDrag(row, id, e.clientX, e.clientY, 'pointer', e.pointerId);
    }

    function onPointerMove(e) {
        if (!swipe.active || swipe.kind !== 'pointer' || e.pointerId !== swipe.pointerId) return;
        moveDrag(e.clientX, e.clientY, () => { if (e.cancelable) e.preventDefault(); });
    }

    function onPointerUp(e) {
        if (swipe.kind !== 'pointer' || e.pointerId !== swipe.pointerId) return;
        commitDrag();
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', (e) => {
        if (swipe.kind === 'pointer' && e.pointerId === swipe.pointerId) resetDrag();
    }, true);

    // 拖拽结束后吞掉「帖子行」上的这一次 click，防止顺手打开帖子。
    // 必须放行脚本自己的 UI（撤销提示条、批量条、✕ 按钮），否则滑完立刻点撤销会点不动。
    document.addEventListener('click', (e) => {
        if (Date.now() > suppressClickUntil) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('.ld-toast') || t.closest('#ld-batch-bar') || t.closest('.ld-x')
            || t.closest('#ld-fab') || t.closest('#ld-panel-mask') || t.closest('#ld-collect-bar')) return;
        if (!t.closest(ROW_SEL)) return;   // 只拦列表行，别影响页面其它交互
        suppressClickUntil = 0;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }, true);

    // ============================================================ 悬停 & 按键
    const hover = { row: null };

    function setHotRow(row) {
        if (hover.row === row) return;
        if (hover.row && hover.row.isConnected) hover.row.classList.remove('ld-hot');
        hover.row = row;
        if (row) row.classList.add('ld-hot');
    }

    document.addEventListener('pointerover', (e) => {
        const row = e.target && e.target.closest ? e.target.closest('tr.topic-list-item, .topic-list-item[data-topic-id]') : null;
        setHotRow(row);
    }, true);

    document.addEventListener('pointerleave', () => setHotRow(null), true);

    function isTyping(e) {
        const t = e.target;
        return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' || t.isContentEditable);
    }

    function modalOpen() {
        if (document.getElementById('ld-panel-mask')) return true; // 收藏夹面板打开时不响应单键快捷键
        return !!document.querySelector('.modal-backdrop, #discourse-modal.show, dialog[open]');
    }

    document.addEventListener('keydown', (e) => {
        // Esc 优先用于关面板
        if (e.key === 'Escape' && document.getElementById('ld-panel-mask')) {
            e.preventDefault();
            closePanel();
            return;
        }
        if (isTyping(e) || modalOpen()) return;
        if (e.ctrlKey || e.altKey) {
            if ((e.key === 'z' || e.key === 'Z') && undoStack.length) {
                e.preventDefault();
                undoLast();
            }
            return;
        }

        // Shift+Z：撤销上一条忽略（避免抢占 Discourse 的 u / b 等单键快捷键）
        if (e.key === 'Z' && e.shiftKey) {
            e.preventDefault();
            undoLast();
            return;
        }

        // Shift+C：打开收藏夹
        if ((e.key === 'c' || e.key === 'C') && e.shiftKey) {
            e.preventDefault();
            if (document.getElementById('ld-panel-mask')) closePanel();
            else openPanel('browse');
            return;
        }

        const k = e.key;
        const hotId = hover.row && hover.row.isConnected ? rowId(hover.row) : '';

        if (k === 'x' || k === 'X') {
            if (batch.on && batch.ids.size) { /* 批量模式交给 Enter */ }
            if (hotId && !mutedSet.has(hotId)) {
                e.preventDefault();
                muteTopic(hotId, hover.row && hover.row.querySelector('.ld-x'));
                return;
            }
            if (!hotId && muteCurrentTopicAndBack()) { e.preventDefault(); return; }
            return;
        }

        // Shift+B：批量模式（避开 Discourse 自带的 b=收藏）
        if (k === 'B') {
            e.preventDefault();
            setBatch(!batch.on);
            toast(batch.on ? '批量模式：点击各行选择，Enter 忽略，Esc 退出' : '已退出批量模式');
            return;
        }

        if (k === 'Enter' && batch.on) {
            e.preventDefault();
            muteBatch();
            return;
        }

        if (k === 'Escape' && batch.on) {
            e.preventDefault();
            setBatch(false);
            return;
        }
    }, true);

    // 批量模式下点击行 = 选择
    document.addEventListener('click', (e) => {
        if (!batch.on) return;
        const row = e.target && e.target.closest ? e.target.closest('tr.topic-list-item, .topic-list-item[data-topic-id]') : null;
        if (!row) return;
        const id = rowId(row);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        if (batch.ids.has(id)) batch.ids.delete(id); else batch.ids.add(id);
        syncSelection();
        updateBatchBar();
    }, true);

    // ============================================================ 视图刷新
    let rafId = null;
    function refreshView() {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            try { processTopics(); } catch (e) { console.warn(LOG, '处理异常', e); }
        });
    }

    processTopics();

    const observer = new MutationObserver(refreshView);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('pageshow', refreshView);
    window.addEventListener('scroll', refreshView, { passive: true });

    // ============================================================ 菜单命令
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('忽略当前帖子', () => {
            const id = currentTopicId();
            if (!id) { toast('当前不在帖子详情页'); return; }
            muteTopic(id, null);
        });
        GM_registerMenuCommand('切换滑动手势开关（左滑忽略/右滑撤销）', () => {
            settings.swipe = !settings.swipe;
            saveSettings();
            toast(`滑动手势：${settings.swipe ? '已开启' : '已关闭'}`);
        });
        GM_registerMenuCommand('调整滑动触发距离（像素）', () => {
            const v = window.prompt('横向拖动多少像素才触发（默认 72，建议 50~120）：', String(settings.swipeThreshold || 72));
            if (v === null) return;
            const n = Number(v);
            if (!isFinite(n) || n < 30) { toast('请输入 ≥30 的数字'); return; }
            settings.swipeThreshold = Math.round(n);
            saveSettings();
            toast(`触发距离已设为 ${settings.swipeThreshold}px`);
        });
        GM_registerMenuCommand('打开我的收藏夹', () => openPanel('browse'));
        GM_registerMenuCommand('从云端刷新收藏夹（换设备/多端同步）', () => {
            syncFromCloud({ silent: false }).then((ok) => {
                if (ok) toast(`已同步：${collections.folders.length} 个收藏夹 / ${totalCollected()} 条`, { timeout: 6000 });
            });
        });
        GM_registerMenuCommand('切换收藏夹云端同步（书签）', () => {
            settings.cloudSync = settings.cloudSync === false;
            saveSettings();
            if (settings.cloudSync) {
                toast('云端同步已开启，正在拉取…');
                syncFromCloud({ silent: true }).then((ok) => {
                    if (!ok) toast('同步失败：' + (syncState.error || '未知错误'), { timeout: 7000 });
                    else toast('云端同步已开启（' + totalCollected() + ' 条）');
                });
            } else {
                toast('云端同步已关闭：收藏只存在本机，换设备看不到');
            }
        });
        GM_registerMenuCommand('查看当前登录账号与同步状态', () => {
            const name = currentUserCache || String(storeGet('ld_username', '') || '（未获取）');
            const last = syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : '从未';
            toast(`账号：${name} ｜ 同步：${settings.cloudSync === false ? '已关闭' : (syncState.error ? '失败' : '正常')} ｜ 上次：${last}`,
                { timeout: 8000 });
        });
        GM_registerMenuCommand('重置登录账号缓存（换号后点这个）', () => {
            forgetUsername();
            syncState.lastSync = 0;
            toast('已重置，下次同步会重新获取账号');
        });
        GM_registerMenuCommand('新建收藏夹', () => {
            const name = window.prompt('新收藏夹名称：');
            if (name === null) return;
            const f = ensureFolder(name);
            if (!f) { toast('请输入名称'); return; }
            updateFab();
            toast(`已创建收藏夹「${f.name}」`);
        });
        GM_registerMenuCommand('显示 / 隐藏收藏夹悬浮按钮', () => {
            settings.showFab = settings.showFab === false;
            saveSettings();
            updateFab();
            toast(`悬浮按钮：${settings.showFab === false ? '已隐藏' : '已显示'}（可用 Shift+C 随时打开）`);
        });
        GM_registerMenuCommand('撤销上一次忽略', undoLast);
        GM_registerMenuCommand('切换批量模式', () => {
            setBatch(!batch.on);
            toast(batch.on ? '批量模式：点击各行选择，Enter 忽略，Esc 退出' : '已退出批量模式');
        });
        GM_registerMenuCommand('查看本地忽略记录数量', () => {
            toast(`本地记录 ${mutedSet.size} 条（服务端真实状态见：偏好设置 → 跟踪 → 已忽略的主题）`);
        });
        GM_registerMenuCommand('清空本地忽略记录（不影响服务端）', () => {
            mutedSet.clear();
            Object.keys(mutedAt).forEach((k) => delete mutedAt[k]);
            saveMuted();
            refreshView();
            toast('本地记录已清空');
        });
        GM_registerMenuCommand('添加自动忽略关键词', () => {
            const kw = window.prompt('输入关键词，标题包含即自动忽略（多个用英文逗号分隔）：',
                (settings.autoKeywords || []).join(','));
            if (kw === null) return;
            settings.autoKeywords = kw.split(',').map((s) => s.trim()).filter(Boolean);
            saveSettings();
            toast(`已设置 ${settings.autoKeywords.length} 个关键词（当前${settings.autoMute ? '已' : '未'}启用自动忽略）`);
        });
        GM_registerMenuCommand('切换关键词自动忽略开关', () => {
            settings.autoMute = !settings.autoMute;
            saveSettings();
            toast(`关键词自动忽略：${settings.autoMute ? '已开启' : '已关闭'}（共 ${(settings.autoKeywords || []).length} 个词）`);
        });

        // 刀哥发帖监控菜单项
        GM_registerMenuCommand('⚡ [刀哥监控] 立即检查最新回复', () => {
            checkAndrewPosts(true);
        });
        GM_registerMenuCommand('⚡ [刀哥监控] 发送飞书测试卡片', () => {
            sendAndrewFeishu(
                'Andrew-hh',
                '【公益推广】千刀兄开启美好11月，炸弹车正在飞奔！已开放 开启千刀狂欢~公益站猛猛开起',
                '测试楼层',
                'https://linux.do/t/topic/2696141',
                new Date().toLocaleString(),
                '这是一条来自油猴脚本的飞书 Webhook 联通性测试消息！'
            );
            toast('已向飞书发送测试通知卡片！');
        });
        GM_registerMenuCommand('⚡ [刀哥监控] 切换开关 (当前已开启)', () => {
            settings.andrewMonitor = (settings.andrewMonitor !== false) ? false : true;
            saveSettings();
            toast(`刀哥发帖监控已${settings.andrewMonitor ? '开启 (每30秒巡逻)' : '暂停'}`);
        });
    }

    updateFab();

    // 启动后静默拉一次云端，保证换设备/多端一致
    if (settings.cloudSync !== false) {
        setTimeout(() => { syncFromCloud({ silent: true }); }, 700);
    }

    // 首次使用引导
    if (!settings.swipeTip) {
        settings.swipeTip = true;
        saveSettings();
        setTimeout(() => {
            toast('帖子上左滑=忽略、右滑=撤销；悬停按 X、Shift+B 批量、Ctrl+Z 撤销',
                { timeout: 9000, soft: true });
        }, 2600);
    }

    // =============================================================== 刀哥(Andrew-hh)千刀贴飞书监控模块
    const ANDREW_USER = 'Andrew-hh';
    const ANDREW_TOPIC_ID = '2696141';
    const ANDREW_FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/781af078-e1d8-41e9-9fda-3428f06f1d15';
    const ANDREW_SEEN_KEY = 'ld_seen_andrew_posts_v1';
    const ANDREW_INTERVAL_SEC = 30; // 30 秒轮询

    function getAndrewSeenIds() {
        try {
            return new Set(JSON.parse(localStorage.getItem(ANDREW_SEEN_KEY) || '[]'));
        } catch (e) {
            return new Set();
        }
    }

    function saveAndrewSeenIds(setObj) {
        localStorage.setItem(ANDREW_SEEN_KEY, JSON.stringify([...setObj]));
    }

    function sendAndrewFeishu(user, title, floor, postUrl, timeStr, content) {
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
                url: ANDREW_FEISHU_WEBHOOK,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify(cardData),
                onload: (res) => console.log(LOG, '[刀哥监控] 飞书推送成功:', res.responseText),
                onerror: (err) => console.error(LOG, '[刀哥监控] 飞书推送失败:', err)
            });
        } else {
            fetch(ANDREW_FEISHU_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cardData)
            }).catch(() => {});
        }
    }

    async function checkAndrewPosts(manual = false) {
        if (settings.andrewMonitor === false && !manual) return;
        try {
            const resp = await fetch(`/user_actions.json?offset=0&username=${ANDREW_USER}&filter=4,5&t=${Date.now()}`);
            if (!resp.ok) {
                if (manual) toast(`检查失败：HTTP ${resp.status}`);
                return;
            }
            const data = await resp.json();
            const actions = data.user_actions || [];

            let seenIds = getAndrewSeenIds();
            const isFirst = (seenIds.size === 0);

            // 过滤目标千刀帖子
            const matched = actions.filter(act => String(act.topic_id) === ANDREW_TOPIC_ID);

            if (isFirst) {
                matched.forEach(a => seenIds.add(String(a.post_id)));
                saveAndrewSeenIds(seenIds);
                console.log(LOG, `[刀哥监控] 初始化完成，已记录既有发言 ${seenIds.size} 条。`);
                if (manual) toast(`刀哥监控初始化完成，已记录既有发言 ${seenIds.size} 条`);
                return;
            }

            let newCount = 0;
            for (const act of matched.reverse()) {
                const pid = String(act.post_id);
                if (!seenIds.has(pid)) {
                    const floor = act.post_number;
                    const url = `https://linux.do/t/topic/${ANDREW_TOPIC_ID}/${floor}`;
                    const timeStr = (act.created_at || '').replace('T', ' ').slice(0, 19);
                    const excerpt = act.excerpt || '';
                    console.log(LOG, `🔥 [刀哥监控发现新回复] #${floor} 楼: ${excerpt}`);
                    
                    // 飞书推送
                    sendAndrewFeishu(ANDREW_USER, act.title, floor, url, timeStr, excerpt);
                    // 页面弹窗通知
                    toast(`⚡ 刀哥在千刀贴发了新回复！(#${floor} 楼)`, { timeout: 8000 });

                    seenIds.add(pid);
                    newCount++;
                }
            }

            saveAndrewSeenIds(seenIds);
            if (manual && newCount === 0) {
                toast(`刀哥当前暂无新回复（已同步最新数据）`);
            }
        } catch (e) {
            console.error(LOG, '[刀哥监控] 检测异常', e);
            if (manual) toast(`检测异常：${e.message}`);
        }
    }

    // 启动刀哥监控轮询（默认开启）
    if (settings.andrewMonitor !== false) {
        console.log(LOG, `[刀哥监控] 已激活，每 ${ANDREW_INTERVAL_SEC} 秒在后台巡逻一次...`);
        setTimeout(() => checkAndrewPosts(false), 3500);
        setInterval(() => checkAndrewPosts(false), ANDREW_INTERVAL_SEC * 1000);
    }

    console.log(LOG, 'v3.2 已就绪 | 收藏夹(云端同步) + 刀哥发帖秒级飞书监控');
})();
