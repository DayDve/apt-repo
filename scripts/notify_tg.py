#!/usr/bin/env python3
"""Send Telegram notifications for changed APT packages.

Grouped by FAMILY: apps that declare FAMILY="<main>" in their package file
share one message with the main app (sendMediaGroup with all linked .debs).
Apps without FAMILY are sent individually.

Env: CHANGED_APPS, REPO, GH_TOKEN, TG_TOKEN, TG_CHAT_ID, DRY_RUN (optional).
Requires a local Telegram Bot API server on http://localhost:8081.
"""

import html
import json
import os
import re
import subprocess

import requests

BOT_API = "http://localhost:8081/bot{token}"


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def parse_apps():
    raw = os.environ.get("CHANGED_APPS", "")
    try:
        apps = json.loads(raw)
    except ValueError:
        return []
    if (isinstance(apps, list) and len(apps) == 1
            and isinstance(apps[0], str) and apps[0].lstrip().startswith("[")):
        try:
            apps = json.loads(apps[0])
        except ValueError:
            pass
    return [a for a in apps if isinstance(a, str) and a]


def read_var(app, name):
    try:
        with open(os.path.join("apps", app, "package")) as f:
            for line in f:
                m = re.match(r'^%s="([^"]*)"' % name, line)
                if m:
                    return m.group(1)
    except OSError:
        pass
    return None


def build_groups(apps):
    fam = {a: read_var(a, "FAMILY") or a for a in apps}
    changed = set(apps)
    groups = {}
    for a in apps:
        head = fam[a] if fam[a] in changed else a
        groups.setdefault(head, []).append(a)
    for head, members in groups.items():
        members.sort(key=lambda x: 0 if x == head else 1)
    return groups


def gh_list_tags(app):
    r = sh(["gh", "release", "list", "--repo", os.environ["REPO"],
            "--json", "tagName", "--jq", ".[].tagName"])
    tags = [t for t in r.stdout.splitlines()
            if re.match(r"^%s-[0-9]" % re.escape(app), t)]
    if not tags:
        return None

    def sort_key(t):
        v = t[len(app) + 1:]
        return [("n", int(x)) if x.isdigit() else ("s", x)
                for x in re.split(r"(\d+)", v) if x]
    return sorted(tags, key=sort_key)[-1]


def extract_repo(url):
    if "github.com/" in url:
        return url.split("github.com/")[-1]
    return ""


def changelog_link(src, cl, tag):
    if cl:
        parts = extract_repo(cl)
        if parts and "/" in parts:
            return "https://github.com/%s/releases/tag/%s" % (parts, tag)
        return cl
    parts = extract_repo(src)
    return "https://github.com/%s/releases/tag/%s" % (parts, tag)


def truncate(caption, link):
    if len(caption) <= 1024:
        return caption
    truncated = caption[:1000]
    last = truncated.rfind("\n")
    if last > 0:
        truncated = truncated[:last]
    truncated = truncated + "\n...\n\n🔗 <a href=\"{0}\">Полный changelog</a>".format(link)
    if truncated.count("<blockquote>") > truncated.count("</blockquote>"):
        truncated += "\n</blockquote>"
    return truncated


def member_data(app):
    tag = gh_list_tags(app)
    if not tag:
        print("No release tag for %s, skipping" % app)
        return None
    ver = tag[len(app) + 1:]
    r = sh(["gh", "release", "view", tag, "--repo", os.environ["REPO"],
            "--json", "body", "--jq", ".body"])
    src = read_var(app, "SOURCE_URL") or ""
    cl = read_var(app, "CHANGELOG_URL") or src
    d = "/tmp/deb-notify/%s" % app
    os.makedirs(d, exist_ok=True)
    sh(["gh", "release", "download", tag, "--repo", os.environ["REPO"],
        "--pattern", "*.deb", "--clobber", "--dir", d])
    debs = [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".deb")]
    if not debs:
        print("No .deb in release %s, skipping" % tag)
        return None
    return {
        "app": app, "tag": tag, "ver": ver,
        "body": html.escape(r.stdout).strip(),
        "desc": read_var(app, "DESCRIPTION") or "",
        "src": src, "cl": cl, "deb": debs[0],
        "link": changelog_link(src, cl, tag),
    }


def caption_for(m, first, group_size):
    cap = "<b>{app} {ver}</b>\n{desc}\n<a href=\"{src}\">Разработчик</a>".format(
        app=m["app"], ver=m["ver"], desc=m["desc"], src=m["src"])
    body = m["body"]
    if body and body != "No user-facing changes for this release.":
        cap += "\n\n📝 WHAT'S NEW\n<blockquote>\n{body}\n</blockquote>".format(body=body)
    if first:
        cap += "\n\n📦 <code>apt install {app}</code>".format(app=m["app"])
    return truncate(cap, m["link"])


def send_document(token, chat_id, m, first):
    caption = caption_for(m, first, 1)
    r = requests.post(BOT_API.format(token=token) + "/sendDocument",
                      data={"chat_id": chat_id, "parse_mode": "HTML",
                            "caption": caption},
                      files={"document": open(m["deb"], "rb")})
    return r


def send_media_group(token, chat_id, members):
    files = {}
    media = []
    for i, m in enumerate(members):
        name = "file%d" % i
        media.append({"type": "document", "media": "attach://" + name,
                      "parse_mode": "HTML",
                      "caption": caption_for(m, i == 0, len(members))})
        files[name] = open(m["deb"], "rb")
    r = requests.post(BOT_API.format(token=token) + "/sendMediaGroup",
                      data={"chat_id": chat_id, "media": json.dumps(media)},
                      files=files)
    return r


def main():
    apps = parse_apps()
    if not apps:
        print("No changed apps, skipping")
        return 0
    groups = build_groups(apps)
    token = os.environ["TG_TOKEN"]
    chat_id = os.environ["TG_CHAT_ID"]
    dry_run = os.environ.get("DRY_RUN") == "1"
    failed = False

    for head in sorted(groups):
        members = []
        for app in groups[head]:
            m = member_data(app)
            if m:
                members.append(m)
        if not members:
            continue
        if dry_run:
            print("=== DRY RUN: group head=%s members=%s ===" % (
                head, [m["app"] for m in members]))
            for m in members:
                print("--- %s (%s) deb=%s" % (m["app"], m["ver"], m["deb"]))
                print(caption_for(m, m is members[0], len(members))[:300])
            continue

        if len(members) == 1:
            r = send_document(token, chat_id, members[0], True)
        else:
            r = send_media_group(token, chat_id, members)
        print(r.status_code, r.text[:500])
        if r.status_code != 200:
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
