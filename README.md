# apt-repo

![Apps](https://img.shields.io/badge/apps-19-blue)
[![Website](https://img.shields.io/badge/website-apt.smbit.pro-4a9eff)](https://apt.smbit.pro)
[![Telegram](https://img.shields.io/badge/channel-@ddaptrepo-26A5E4?logo=telegram)](https://t.me/ddaptrepo)

Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos. Packages are delivered as-is from upstream developers or repackagers - no guarantees on functionality or fitness for purpose.

## Available packages

Packages that belong together are combined into a family (collapsible).

<details>
<summary><b><a href="https://github.com/ilia-maslakov/mcdev">mc6</a></b> — Midnight Commander with Plugins · 3 packages</summary>

- [mc6](https://github.com/ilia-maslakov/mcdev)
- [mc6-data](https://github.com/ilia-maslakov/mcdev)
- [mc6-plugins](https://github.com/ilia-maslakov/mcdev)

</details>

<details>
<summary><b><a href="https://github.com/Rongronggg9/wps-office-repack">wps-office</a></b> — WPS Office repack with patches · 2 packages</summary>

- [wps-office](https://github.com/Rongronggg9/wps-office-repack)
- [wps-office-langpack-ru](https://github.com/DayDve/wps-office-langpack-ru)

</details>

| App | Description |
|---|---|
| [ayugram](https://github.com/AyuGram/AyuGramDesktop) | Telegram client with enhanced features |
| [bees](https://github.com/Zygo/bees) | btrfs deduplication daemon |
| [btrfs-assistant](https://gitlab.com/btrfs-assistant/btrfs-assistant) | GUI management tool for Btrfs filesystem |
| [fonts-noto-lite](https://github.com/DayDve/fonts-noto-lite) | Hide non-Latin/Cyrillic Noto fonts from font selection dialogs on Ubuntu/Debian |
| [grub-btrfs](https://github.com/Antynea/grub-btrfs) | GRUB menu entries for btrfs snapshots |
| [keyd](https://github.com/rvaiya/keyd) | Key remapping daemon |
| [localsend](https://github.com/localsend/localsend) | Cross-platform file sharing over local network |
| [rclone](https://github.com/rclone/rclone) | rsync for cloud storage |
| [remotedesktopmanager](https://devolutions.net/remote-desktop-manager/) | One application for every remote connection you'll ever open |
| [rustdesk](https://github.com/rustdesk/rustdesk) | Fast open-source remote desktop |
| [scrcpy](https://github.com/Genymobile/scrcpy) | Mirror and control Android devices via USB/TCP |
| [viber](https://www.viber.com) | Free and secure calls and messages to anyone, anywhere |
| [winegui](https://github.com/winegui/WineGUI) | Wine prefix manager with a modern GUI |
| [wlvncc](https://github.com/any1/wlvncc) | Wayland native VNC client |

## Install

```bash
sudo curl -fsSL https://apt.smbit.pro/apt-key.asc \
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \
  https://apt.smbit.pro noble main" \
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \
sudo apt update
```

## Want to add a package?

Open a pull request with `apps/<app>/` containing two files. Use [`docs/template/`](docs/template/) as a starting point.

| File | Requirements |
|---|---|
| `Dockerfile` | Multi-stage build for `docker buildx`. Final stage must be `FROM scratch` with `COPY --from=<stage> /path/*.deb /`. Build arg `APP_VERSION` is passed automatically. |
| `package` | Sourced by [`apps/build.sh`](apps/build.sh). Must define `SOURCE_URL`, `check_update()`, and `get_version()`. See [template](docs/template/package) for the interface and patterns. |

The PR description should explain what the package is and why it doesn't belong in standard repos.
