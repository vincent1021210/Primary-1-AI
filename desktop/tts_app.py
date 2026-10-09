#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本機文字轉語音程式：使用 Windows 系統語音（免費、免 API Key）。"""

from __future__ import annotations

import re
import threading
import tkinter as tk
from tkinter import messagebox, ttk

import pyttsx3


def detect_lang(text: str) -> str:
    sample = (text or "")[:400]
    if not sample.strip():
        return "zh-TW"
    cjk = len(re.findall(r"[\u4e00-\u9fff]", sample))
    latin = len(re.findall(r"[A-Za-z]", sample))
    total = max(cjk + latin, 1)
    if cjk / total >= 0.25 or cjk >= 4:
        return "zh-TW"
    if latin / total >= 0.5:
        return "en-US"
    return "zh-TW"


def voice_matches_lang(voice_name: str, voice_id: str, lang: str) -> bool:
    blob = f"{voice_name} {voice_id}".lower()
    if lang.startswith("zh"):
        return any(
            key in blob
            for key in (
                "zh-tw",
                "zh_tw",
                "zh-hk",
                "zh_hk",
                "zh-cn",
                "zh_cn",
                "chinese",
                "hanhan",
                "tracy",
                "huihui",
                "taiwan",
                "hongkong",
            )
        )
    if lang.startswith("en"):
        return any(
            key in blob
            for key in ("en-us", "en_us", "en-gb", "english", "zira", "david", "mark")
        )
    return False


class TTSApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("AI 朗讀（本機版）")
        self.root.geometry("560x520")
        self.root.minsize(480, 420)

        self._engine: pyttsx3.Engine | None = None
        self._voices: list = []
        self._base_rate = 200
        self._speak_thread: threading.Thread | None = None
        self._stop_flag = threading.Event()
        self._lock = threading.Lock()

        self._build_ui()
        self._init_engine()

    def _build_ui(self) -> None:
        pad = {"padx": 12, "pady": 6}
        main = ttk.Frame(self.root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        title = ttk.Label(main, text="AI 朗讀", font=("Microsoft JhengHei UI", 16, "bold"))
        title.pack(anchor=tk.W)
        ttk.Label(
            main,
            text="使用 Windows 系統語音 · 完全免費 · 無需 API Key",
            foreground="#5a738a",
        ).pack(anchor=tk.W, pady=(0, 8))

        ttk.Label(main, text="要朗讀的文字").pack(anchor=tk.W)
        self.text = tk.Text(main, height=12, wrap=tk.WORD, font=("Microsoft JhengHei UI", 11))
        self.text.pack(fill=tk.BOTH, expand=True, pady=(4, 8))
        self.text.insert(
            "1.0",
            "你好，這是本機文字轉語音測試。Hello, this is a local TTS test.",
        )

        ctrl = ttk.Frame(main)
        ctrl.pack(fill=tk.X, **pad)

        ttk.Label(ctrl, text="語速").grid(row=0, column=0, sticky=tk.W)
        self.rate_var = tk.DoubleVar(value=1.0)
        self.rate_label = ttk.Label(ctrl, text="1.0x", width=6)
        self.rate_label.grid(row=0, column=2, sticky=tk.E)
        rate = ttk.Scale(
            ctrl,
            from_=0.5,
            to=2.0,
            orient=tk.HORIZONTAL,
            variable=self.rate_var,
            command=self._on_rate_change,
        )
        rate.grid(row=0, column=1, sticky=tk.EW, padx=8)
        ctrl.columnconfigure(1, weight=1)

        chips = ttk.Frame(main)
        chips.pack(fill=tk.X)
        for value in (1.0, 1.25, 1.5):
            ttk.Button(
                chips,
                text=f"{value:g}x",
                width=6,
                command=lambda v=value: self._set_rate(v),
            ).pack(side=tk.LEFT, padx=(0, 6))

        row = ttk.Frame(main)
        row.pack(fill=tk.X, pady=(10, 4))
        ttk.Label(row, text="語言").pack(side=tk.LEFT)
        self.lang_var = tk.StringVar(value="自動偵測")
        self._lang_map = {
            "自動偵測": "auto",
            "繁體中文": "zh-TW",
            "English": "en-US",
        }
        lang = ttk.Combobox(
            row,
            textvariable=self.lang_var,
            state="readonly",
            width=18,
            values=tuple(self._lang_map.keys()),
        )
        lang.pack(side=tk.LEFT, padx=(8, 16))
        lang.bind("<<ComboboxSelected>>", lambda _e: self._refresh_voice_hint())

        ttk.Label(row, text="語音").pack(side=tk.LEFT)
        self.voice_var = tk.StringVar()
        self.voice_combo = ttk.Combobox(row, textvariable=self.voice_var, state="readonly")
        self.voice_combo.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(8, 0))

        btns = ttk.Frame(main)
        btns.pack(fill=tk.X, pady=12)
        ttk.Button(btns, text="朗讀", command=self.speak).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btns, text="停止", command=self.stop).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btns, text="清空", command=self.clear_text).pack(side=tk.LEFT)

        self.status = ttk.Label(main, text="就緒", foreground="#5a738a")
        self.status.pack(anchor=tk.W)

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _init_engine(self) -> None:
        try:
            engine = pyttsx3.init("sapi5")
        except Exception:
            engine = pyttsx3.init()

        self._engine = engine
        self._base_rate = int(engine.getProperty("rate") or 200)
        self._voices = list(engine.getProperty("voices") or [])

        names = ["（自動挑選）"] + [v.name for v in self._voices]
        self.voice_combo["values"] = names
        self.voice_combo.current(0)

        if self._voices:
            listed = "、".join(v.name for v in self._voices[:3])
            self._set_status(f"已載入 {len(self._voices)} 個系統語音（{listed}…）")
        else:
            self._set_status("找不到系統語音，請確認 Windows 語音套件已安裝", error=True)

    def _on_rate_change(self, _value: str | None = None) -> None:
        rate = round(float(self.rate_var.get()), 2)
        self.rate_label.configure(text=f"{rate:g}x")

    def _set_rate(self, value: float) -> None:
        self.rate_var.set(value)
        self._on_rate_change()

    def _set_status(self, message: str, error: bool = False) -> None:
        self.status.configure(text=message, foreground="#b42318" if error else "#5a738a")

    def _selected_lang_code(self) -> str:
        return self._lang_map.get(self.lang_var.get(), "auto")

    def _refresh_voice_hint(self) -> None:
        lang = self._selected_lang_code()
        if lang == "auto":
            self._set_status("語言：自動偵測（依文字判斷中／英）")
        else:
            self._set_status(f"語言固定為 {lang}")

    def clear_text(self) -> None:
        self.text.delete("1.0", tk.END)

    def speak(self) -> None:
        text = self.text.get("1.0", tk.END).strip()
        if not text:
            messagebox.showinfo("提示", "請先輸入要朗讀的文字")
            return

        if self._speak_thread and self._speak_thread.is_alive():
            self.stop()
            self.root.after(200, lambda: self._start_speak(text))
            return

        self._start_speak(text)

    def _start_speak(self, text: str) -> None:
        self._stop_flag.clear()
        self._set_status("朗讀中…")
        rate_mul = float(self.rate_var.get())
        lang_code = self._selected_lang_code()
        voice_choice = self.voice_var.get()
        self._speak_thread = threading.Thread(
            target=self._speak_worker,
            args=(text, rate_mul, lang_code, voice_choice),
            daemon=True,
        )
        self._speak_thread.start()

    def _resolve_voice_id(self, text: str, lang_code: str, voice_choice: str) -> str | None:
        if voice_choice and voice_choice != "（自動挑選）":
            for v in self._voices:
                if v.name == voice_choice:
                    return v.id

        lang = detect_lang(text) if lang_code == "auto" else lang_code
        for v in self._voices:
            if voice_matches_lang(v.name, v.id, lang):
                return v.id
        return self._voices[0].id if self._voices else None

    def _speak_worker(
        self,
        text: str,
        rate_mul: float,
        lang_code: str,
        voice_choice: str,
    ) -> None:
        with self._lock:
            if self._engine is None:
                self.root.after(0, lambda: self._set_status("引擎未就緒", error=True))
                return

            try:
                self._engine.stop()
            except Exception:
                pass

            try:
                engine = pyttsx3.init("sapi5")
            except Exception:
                engine = pyttsx3.init()
            self._engine = engine

            voice_id = self._resolve_voice_id(text, lang_code, voice_choice)
            if voice_id:
                engine.setProperty("voice", voice_id)

            engine.setProperty(
                "rate",
                max(80, min(400, int(self._base_rate * rate_mul))),
            )

            lang = detect_lang(text) if lang_code == "auto" else lang_code
            voice_name = next(
                (v.name for v in self._voices if v.id == voice_id),
                "預設",
            )

            if self._stop_flag.is_set():
                return

            engine.say(text)
            try:
                engine.runAndWait()
            except Exception as exc:
                self.root.after(
                    0,
                    lambda: self._set_status(f"播放失敗：{exc}", error=True),
                )
                return

            if self._stop_flag.is_set():
                self.root.after(0, lambda: self._set_status("已停止"))
            else:
                self.root.after(
                    0,
                    lambda: self._set_status(f"完成（{lang} · {voice_name}）"),
                )

    def stop(self) -> None:
        self._stop_flag.set()
        with self._lock:
            if self._engine is not None:
                try:
                    self._engine.stop()
                except Exception:
                    pass
        self._set_status("已停止")

    def _on_close(self) -> None:
        self.stop()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    try:
        root.call("tk", "scaling", 1.25)
    except tk.TclError:
        pass
    TTSApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
