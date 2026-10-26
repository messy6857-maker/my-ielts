# -*- coding: utf-8 -*-
"""同步远程 master 的每日阅读数据到本地工作区。

背景：每日阅读的定时任务（daily-reading-generator）每天 08:00 用 Git Data API
直接向远程 master 提交 src/pages/reading/daily/ 下的新文件，本地工作区不会自动
跟进。功能发布（feature publish）若把本地过时的 daily/index.json 一并推上去，
会覆盖掉定时任务写好的日期索引，导致线上每日阅读显示"暂无"（2026-10-19 发生过两次）。

用法：每次功能发布前运行一次本脚本（或在发布文件清单里直接排除
src/pages/reading/daily/ 目录）。脚本只读写 src/pages/reading/daily/，
不碰工作区其他文件（含未提交的备份功能文件）。
"""
import json
import sys
import urllib.request

REPO = "messy6857-maker/my-ielts"
BRANCH = "master"
DAILY_DIR = "/home/hatch/workspace/my-ielts/src/pages/reading/daily"
RAW = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/src/pages/reading/daily"


def fetch(path):
    with urllib.request.urlopen(f"{RAW}/{path}", timeout=30) as resp:
        return resp.read()


def main():
    raw_index = fetch("index.json")
    dates = json.loads(raw_index.decode("utf-8")).get("dates", [])
    print(f"remote dates: {dates}")

    # 按远程字节原样写入（不重新格式化），避免产生无意义的 diff
    with open(f"{DAILY_DIR}/index.json", "wb") as f:
        f.write(raw_index)
    print("updated: index.json")

    for d in dates:
        name = f"{d}.json"
        data = fetch(name)
        with open(f"{DAILY_DIR}/{name}", "wb") as f:
            f.write(data)
        print(f"updated: {name} ({len(data)} bytes)")

    print("done. 本地 daily/ 已与远程 master 同步，发布时包含这些文件也无害。")


if __name__ == "__main__":
    sys.exit(main())
