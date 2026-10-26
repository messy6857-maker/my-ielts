#!/usr/bin/env python3
"""Direct-push dist/ to gh-pages via Git Data API (Actions is disabled).

Usage: python3 scripts/deploy-gh-pages.py
Only uploads new/changed files (compared by git blob sha against the
remote gh-pages tree, base_tree = current tree). Never deletes files.
Token is handled by the authd surrogate exchange; never printed.
"""
import base64
import hashlib
import json
import os
import sys
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request

REPO = "messy6857-maker/my-ielts"
BRANCH = "gh-pages"
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")


def api(method, path, body=None):
    url = f"https://api.github.com/repos/{REPO}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "Accept": "application/vnd.github+json"},
        method=method.upper(),
    )
    add_surrogate_to_request(req, "custom.github", allowed_hosts=("api.github.com", "github.com"))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"API {method} {path} -> HTTP {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
        raise


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def main():
    ref = api("GET", f"/git/ref/heads/{BRANCH}")
    old_commit = ref["object"]["sha"]
    old_tree = api("GET", f"/git/commits/{old_commit}")["tree"]["sha"]
    remote = api("GET", f"/git/trees/{old_tree}?recursive=1")
    remote_map = {e["path"]: e["sha"] for e in remote.get("tree", []) if e["type"] == "blob"}
    print(f"gh-pages head: {old_commit} tree: {old_tree} ({len(remote_map)} blobs)")

    changed = []
    for root, _dirs, files in os.walk(DIST):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, DIST)
            with open(full, "rb") as f:
                data = f.read()
            if remote_map.get(rel) == blob_sha(data):
                continue
            changed.append((rel, data))
    print(f"changed files: {len(changed)}")
    for rel, _ in changed:
        print(f"  {rel}")

    tree_entries = []
    for rel, data in changed:
        blob = api("POST", "/git/blobs", {
            "content": base64.b64encode(data).decode(),
            "encoding": "base64",
        })
        tree_entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})

    if tree_entries:
        new_tree = api("POST", "/git/trees", {"base_tree": old_tree, "tree": tree_entries})
        commit = api("POST", "/git/commits", {
            "message": "Deploy my-ielts site (manual direct push, Actions disabled)",
            "tree": new_tree["sha"],
            "parents": [old_commit],
        })
        api("PATCH", f"/git/refs/heads/{BRANCH}", {"sha": commit["sha"]})
        print(f"new gh-pages commit: {commit['sha']}")
    else:
        print("nothing changed, gh-pages untouched")
        print(f"gh-pages commit: {old_commit}")


if __name__ == "__main__":
    main()
