import json

with open('/tmp/packages.json') as f:
    pkgs = json.load(f)

rows = '\n'.join('| [{}]({}) | {} |'.format(p['name'], p['source'], p['description']) for p in pkgs)
n = len(pkgs)

template = """\
# apt-repo

![Apps](https://img.shields.io/badge/apps-__COUNT__-blue)
[![Website](https://img.shields.io/badge/website-apt.smbit.pro-4a9eff)](https://apt.smbit.pro)
[![Telegram](https://img.shields.io/badge/channel-@ddaptrepo-26A5E4?logo=telegram)](https://t.me/ddaptrepo)

Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos. Packages are delivered as-is from upstream developers or repackagers - no guarantees on functionality or fitness for purpose.

## Available packages

| App | Description |
|---|---|
__ROWS__

## Install

```bash
sudo curl -fsSL https://apt.smbit.pro/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  https://apt.smbit.pro noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update
```

## Want to add a package?

Open a pull request with `apps/<app>/` containing two files. Use [`docs/template/`](docs/template/) as a starting point.

| File | Requirements |
|---|---|
| `Dockerfile` | Multi-stage build for `docker buildx`. Final stage must be `FROM scratch` with `COPY --from=<stage> /path/*.deb /`. Build arg `APP_VERSION` is passed automatically. |
| `package` | Sourced by [`apps/build.sh`](apps/build.sh). Must define `SOURCE_URL`, `check_update()`, and `get_version()`. See [template](docs/template/package) for the interface and patterns. |

The PR description should explain what the package is and why it doesn't belong in standard repos.
"""

content = template.replace('__COUNT__', str(n)).replace('__ROWS__', rows)

with open('README.md', 'w') as f:
    f.write(content)