import time
import sys

def run_setup():
    print("==================================================")
    print("正在通过 Browser Harness 自动配置 GitHub 仓库与 Pages...")
    print("==================================================")

    # 1. 打开 Settings 页面
    new_tab("https://github.com/leroy668/linuxdo-monitor/settings")
    wait_for_load()
    time.sleep(2)
    print("已打开 Settings 页面:", page_info().get('url'))

    # 检查是否已经是公开仓库
    is_public = js('''
    (() => {
        const badge = document.querySelector('span.Label--secondary') || document.querySelector('.Label');
        return document.body.innerText.includes('Change repository visibility') && !document.body.innerText.includes('This repository is currently private.');
    })()
    ''')
    print("当前是否已公开或检测状态:", is_public)

    # 2. 导航到 Pages 页面
    new_tab("https://github.com/leroy668/linuxdo-monitor/settings/pages")
    wait_for_load()
    time.sleep(2)
    print("已打开 Pages 页面:", page_info().get('url'))

    # 切换 Source 为 GitHub Actions
    res_source = js('''
    (() => {
        // 查找 Source 下拉框或选项
        const select = document.querySelector('select[name="pages[source]"]');
        if (select) {
            select.value = 'workflow';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, method: 'select' };
        }
        
        // 新版 Primer 下拉菜单
        const buttons = Array.from(document.querySelectorAll('button, summary'));
        const sourceBtn = buttons.find(b => b.innerText.includes('Deploy from a branch') || b.innerText.includes('GitHub Actions'));
        if (sourceBtn) {
            sourceBtn.click();
            return { success: true, method: 'clicked_source_btn' };
        }
        return { success: false, reason: 'Source selector not found' };
    })()
    ''')
    print("Pages 选项设置结果:", res_source)

    print("==================================================")
    print("配置指令已全部执行！")
    print("==================================================")

run_setup()
