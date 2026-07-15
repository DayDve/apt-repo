# apt-repo

![Apps](https://img.shields.io/badge/apps-7-blue)

Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos. Packages are delivered as-is from upstream developers or repackagers - no guarantees on functionality or fitness for purpose.

## Available packages

| App | Description |
|---|---|
| [ayugram](https://github.com/AyuGram/AyuGramDesktop) | Telegram client with enhanced features |
| [bees](https://github.com/Zygo/bees) | btrfs deduplication daemon |
| [grub-btrfs](https://github.com/Antynea/grub-btrfs) | GRUB menu entries for btrfs snapshots |
| [keyd](https://github.com/rvaiya/keyd) | Key remapping daemon |
| [rclone](https://github.com/rclone/rclone) | rsync for cloud storage |
| [rdm](https://devolutions.net/remote-desktop-manager/) | Remote Desktop Manager |
| [wps-office](https://github.com/Rongronggg9/wps-office-repack) | WPS Office repack with patches |

## Install

```bash
sudo curl -fsSL https://apt.smbit.pro/apt-key.asc \
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \
  https://apt.smbit.pro $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \
sudo apt update
```

## Want to add a package?

Open a pull request with `apps/<app>/` containing two files. Use [`apps/template/`](apps/template/) as a starting point.

| File | Requirements |
|---|---|
| `Dockerfile` | Multi-stage build for `docker buildx`. Final stage must be `FROM scratch` with `COPY --from=<stage> /path/*.deb /`. Build arg `APP_VERSION` is passed automatically. |
| `package` | Sourced by [`apps/build.sh`](apps/build.sh). Must define `SOURCE_URL`, `check_update()`, and `get_version()`. See [template](apps/template/package) for the interface and patterns. |

The PR description should explain what the package is and why it doesn't belong in standard repos.
