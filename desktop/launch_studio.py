#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""啟動本機語音助手（TTS + STT），以 localhost 提供頁面並開啟瀏覽器。"""

from __future__ import annotations

import functools
import http.server
import socket
import socketserver
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREFERRED_PORT = 8765


def find_free_port(start: int = PREFERRED_PORT) -> int:
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("找不到可用埠號")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        # 開發時避免 CSS／JS 被瀏覽器舊快取卡住
        if self.path.split("?", 1)[0].endswith(
            (".html", ".css", ".js")
        ):
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        # 精簡輸出
        print(f"[語音助手] {args[0]}")


def main() -> None:
    port = find_free_port()
    url = f"http://127.0.0.1:{port}/voice_studio.html"

    handler = functools.partial(QuietHandler)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    print("=" * 52)
    print(" AI 語音助手（聽寫 STT + 朗讀 TTS）")
    print(f" 網址：{url}")
    print(" 請用 Chrome 或 Edge；首次聽寫請允許麥克風。")
    print(" 關閉此視窗即可結束伺服器。")
    print("=" * 52)

    time.sleep(0.4)
    # 優先 Edge／Chrome（SpeechRecognition 支援佳）
    opened = False
    for browser_name in ("windows-default", "chrome", "edge"):
        try:
            browser = webbrowser.get(browser_name)
            browser.open(url)
            opened = True
            break
        except Exception:
            continue
    if not opened:
        webbrowser.open(url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n正在關閉…")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
