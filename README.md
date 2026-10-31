# local-git-change-viewer

Simple, view-only, mobile-friendly git viewer for repos on your machine. Inspired by SikaGit, but much smaller: one Node file, one HTML file, no dependencies.

![panels: repos | changes | graph]()

## Features

- **Repo list** (left): every git repo found in your folders (up to 3 levels deep), grouped by folder, with indicators:
  - 🟢 clean / 🟠 changed files count
  - `↑n` ahead, `↓n` behind upstream
  - current branch
- **Changes** (top right): all staged, unstaged and untracked files, each as an expandable card with a colored diff (expanded by default, Expand/Collapse all).
- **Graph** (bottom right): lane graph of the latest 300 commits across all branches, with branch/tag labels. Click a commit to see its files.
- **Resizable panels** with drag handles (touch works too); sizes are remembered.
- **Mobile**: same 3-panel layout, fits one screen, no page scrolling.
- **Settings** (⚙): add/remove folders, theme (dark/light), font size, font family, code font. Saved in the browser's IndexedDB.
- **Read-only**: only runs `git status`, `diff`, `log`, `show`. Repos are mounted read-only in Docker.

## Run with Docker

```bash
cp .env.example .env   # then edit paths
docker compose up -d --build
```

Open `http://localhost:8005` (or the `PORT` you set).

| Variable | Meaning |
| --- | --- |
| `ALLOW_ROOT` | Base folder mounted read-only. Folders added in settings must be inside it. |
| `PROJECTS_DIR` | Default folder shown on first load. |
| `PORT` | Host port (default `8005`). |
| `UID` / `GID` | Host user that owns the repos, so git can read them. |

After changing code, rebuild with `docker compose up -d --build`.

## Run without Docker

Requires Node 18+ and git.

```bash
PROJECTS_DIR=~/code PORT=8005 node server.js
```

## HTTPS (optional)

Put it behind a reverse proxy, e.g. nginx:

```nginx
server {
  listen 9005 ssl;
  server_name myhost.local;
  ssl_certificate     /certs/server.crt;
  ssl_certificate_key /certs/server.key;
  location / {
    proxy_pass http://127.0.0.1:8005;
    proxy_set_header Host $http_host;
  }
}
```

## Security

There is no login. Anyone who can reach the port can read the code and diffs inside `ALLOW_ROOT`. Run it only on a trusted network.
