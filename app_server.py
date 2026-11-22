import http.server
import socketserver
import json
import os
import webbrowser
import rewards_manager
import auto_reply_claim

PORT = 8787
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class RewardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == "/api/rewards":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            data = rewards_manager.load_data()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            req_data = json.loads(body)
        except Exception:
            req_data = {}

        if self.path == "/api/claim":
            topic_id = req_data.get("topic_id")
            uid = req_data.get("uid")
            if topic_id and uid:
                auto_reply_claim.claim_topic(topic_id, uid)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "已成功代回帖并更新状态为待到账"}).encode("utf-8"))
            else:
                self.send_response(400)
                self.end_headers()
        elif self.path == "/api/mark_done":
            topic_id = req_data.get("topic_id")
            if topic_id:
                rewards_manager.mark_claimed(topic_id)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode("utf-8"))
            else:
                self.send_response(400)
                self.end_headers()
        elif self.path == "/api/rewards/sync":
            if isinstance(req_data, list):
                rewards_manager.save_data(req_data)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "synced"}).encode("utf-8"))
            else:
                self.send_response(400)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), RewardHandler) as httpd:
        url = f"http://127.0.0.1:{PORT}/index.html"
        print("==================================================")
        print(f"🎁 中转站福利管理系统正在运行中...")
        print(f"👉 访问地址: {url}")
        print(f"按 Ctrl + C 即可停止服务。")
        print("==================================================")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已停止。")

if __name__ == "__main__":
    main()
