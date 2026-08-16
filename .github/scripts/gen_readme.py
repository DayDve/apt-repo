import html
import json
from collections import OrderedDict


def esc(s):
    return html.escape(str(s), quote=False)


def pkg_row(p):
    return '| [{}]({}) | {} |'.format(p['name'], p['source'], p['description'])


with open('/tmp/packages.json') as f:
    pkgs = json.load(f)

groups = OrderedDict()
standalone = []
for p in pkgs:
    g = p.get('group')
    if g:
        groups.setdefault(g, []).append(p)
    else:
        standalone.append(p)

families = []
for g, members in groups.items():
    members.sort(key=lambda p: p['name'])
    if len(members) < 2:
        standalone.extend(members)
        continue
    head = next((m for m in members if m['name'] == g), members[0])
    families.append((g, head, members))

families.sort(key=lambda f: f[0])
standalone.sort(key=lambda p: p['name'])

family_blocks = []
for g, head, members in families:
    n = len(members)
    items = '\n'.join('- [{}]({})'.format(m['name'], m['source']) for m in members)
    family_blocks.append(
        '<details>\n'
        '<summary><b><a href="{src}">{g}</a></b> — {desc} · {n} package{s}</summary>\n\n'
        '{items}\n\n'
        '</details>'.format(
            src=esc(head['source']), g=esc(g), desc=esc(head['description']),
            n=n, s='' if n == 1 else 's', items=items)
    )

families_html = '\n\n'.join(family_blocks)
rows = '\n'.join(pkg_row(p) for p in standalone)
n = len(pkgs)

if families_html:
    avail = (
        '## Available packages\n\n'
        'Packages that belong together are combined into a family (collapsible).\n\n'
        + families_html + '\n\n'
        '| App | Description |\n'
        '|---|---|\n'
        + rows
    )
else:
    avail = (
        '## Available packages\n\n'
        '| App | Description |\n'
        '|---|---|\n'
        + rows
    )

template = """\
# apt-repo

![Apps](https://img.shields.io/badge/apps-__COUNT__-blue)
[![Website](https://img.shields.io/badge/website-apt.smbit.pro-4a9eff)](https://apt.smbit.pro)
[![Telegram](https://img.shields.io/badge/channel-@ddaptrepo-26A5E4?logo=telegram)](https://t.me/ddaptrepo)

Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos. Packages are delivered as-is from upstream developers or repackagers - no guarantees on functionality or fitness for purpose.

__AVAIL__

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

content = template.replace('__COUNT__', str(n)).replace('__AVAIL__', avail)

with open('README.md', 'w') as f:
    f.write(content)
