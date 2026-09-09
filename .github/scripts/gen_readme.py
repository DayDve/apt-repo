import json
import os

import jinja2

HERE = os.path.dirname(os.path.abspath(__file__))


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"ERROR: required env var {name} is not set (set it in the workflow from repo vars)")
    return value


repo = required("GITHUB_REPOSITORY")
repo_owner, repo_name = repo.split("/", 1)

apt_origin = required("APT_ORIGIN").rstrip("/")
apt_domain = apt_origin.split("://", 1)[-1].split("/", 1)[0]

telegram = required("TELEGRAM").rstrip("/")
tg_handle = telegram.rsplit("/", 1)[-1]

with open("/tmp/packages.json") as f:
    pkgs = json.load(f)

env = jinja2.Environment(loader=jinja2.FileSystemLoader(HERE), keep_trailing_newline=True)
content = env.get_template("README.md.j2").render(
    repo_name=repo_name,
    keyring_name=f"{repo_owner.lower()}-apt-repo",
    app_count=len(pkgs),
    apt_domain=apt_domain,
    tg_handle=tg_handle,
)

with open("README.md", "w") as f:
    f.write(content)
