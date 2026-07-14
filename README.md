# apt-repo

Personal apt repository for software not available in standard repos.

## Structure

```
apps/
├── build.sh           # build any app: bash apps/build.sh <app>
└── <app>/
    ├── Dockerfile     # produces .deb into /
    ├── check_update   # exit 0 if upstream has newer version
    └── get_version    # stdout: version=... \n --- \n changelog
```

## Usage

Build locally:
```bash
bash apps/build.sh bees
```

Release is created automatically on main/master via CI.
