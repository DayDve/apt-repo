# apt-repo

![Apps](https://img.shields.io/badge/apps-7-blue)

Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos. Packages are delivered as-is from upstream developers or repackagers - no guarantees on functionality or fitness for purpose.

## Available packages

| App | Description | Source |
|---|---|---|
| **ayugram** | Telegram client with enhanced features | [AyuGram/AyuGramDesktop](https://github.com/AyuGram/AyuGramDesktop) |
| **bees** | btrfs deduplication daemon | [Zygo/bees](https://github.com/Zygo/bees) |
| **grub-btrfs** | GRUB menu entries for btrfs snapshots | [Antynea/grub-btrfs](https://github.com/Antynea/grub-btrfs) |
| **keyd** | Key remapping daemon | [rvaiya/keyd](https://github.com/rvaiya/keyd) |
| **rclone** | rsync for cloud storage | [rclone/rclone](https://github.com/rclone/rclone) |
| **rdm** | Remote Desktop Manager | [Devolutions](https://devolutions.net/remote-desktop-manager/) |
| **wps-office** | WPS Office repack with patches | [Rongronggg9/wps-office-repack](https://github.com/Rongronggg9/wps-office-repack) |

## Install

```bash
sudo curl -fsSL https://apt.smbit.pro/apt-key.asc -o /etc/apt/keyrings/daydve-apt-repo.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] https://apt.smbit.pro $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list
sudo apt update
sudo apt install <package>
```

## Want to add a package?

Open a pull request with `apps/<app>/` containing two files. Use [`apps/template/`](apps/template/) as a starting point.

| File | Requirements |
|---|---|
| `Dockerfile` | Multi-stage build for `docker buildx`. Final stage must be `FROM scratch` with `COPY --from=<stage> /path/*.deb /`. Build arg `APP_VERSION` is passed automatically. |
| `package` | Sourced by [`apps/build.sh`](apps/build.sh). Must define `SOURCE_URL`, `check_update()`, and `get_version()`. See [template](apps/template/package) for interface and common patterns. Available helpers: `gh_tag_ahead`, `gh_latest_release`, `gh_tag_message`, `gh_commits_between`, `gh_release_body`. |

The PR description should explain what the package is and why it doesn't belong in standard repos.
