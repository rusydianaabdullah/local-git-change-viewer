# local-git-change-viewer

Simple, mobile-friendly git viewer (view plus fetch/pull) for repos on your machine. Inspired by SikaGit, but much smaller: one Node file, one HTML file, no dependencies.

![panels: repos | changes | graph]()

## Features

- **Repo list** (left): every git repo found in your folders (up to 3 levels deep), grouped by folder, with indicators:
  - 🟢 clean / 🟠 changed files count
  - `↑n` ahead, `↓n` behind upstream
  - current branch
  - last commit age badge (`5m`, `3h`, `2d`, `4mo`): green within a day, blue within a week, dim when older
- **Fetch / Pull**: header buttons run `git fetch --all --prune` or `git pull --ff-only` on every repo (4 at a time, progress and failures shown in a toast); the graph bar has the same buttons for the open repo. Pull never merges or rebases; diverged or conflicting repos are reported, not changed.
- **Changes** (top right): all staged, unstaged and untracked files, each as an expandable card with a colored diff (expanded by default, Expand/Collapse all).
- **Graph** (bottom right): lane graph of the latest 300 commits across all branches, with branch/tag labels and author. `…` marks commits with a longer message.
  - **Simple view**: one line per commit.
  - **Long view**: line 1 hash, author, time; line 2 the full commit title, wrapped.
- **Commit details**: click a commit to see author, committer (if different), dates, full hash, parents, refs and the full message, then its files and diffs.
- **Resizable panels** with drag handles (touch works too); sizes are remembered.
- **Mobile**: same 3-panel layout, fits one screen, no page scrolling.
- **Settings** (⚙): add/remove folders, theme (dark/light), font size and code font size (− / +, 7–24px, scales the whole UI), font family, code font, default changes view. Saved in the browser's IndexedDB.
- **Installable PWA**: install from the browser's address bar for an app window and icon. Needs `localhost` or HTTPS.
- **No working-tree edits**: only runs `git status`, `diff`, `log`, `show`, plus `fetch` and `pull --ff-only` when you click them.

## Run with Docker

```bash
cp .env.example .env   # then edit paths
docker compose up -d --build
```

Open `http://localhost:8005` (or the `PORT` you set).

| Variable | Meaning |
| --- | --- |
| `ALLOW_ROOT` | Base folder mounted read-write (needed for fetch/pull). Folders added in settings must be inside it. |
| `PROJECTS_DIR` | Default folder shown on first load. |
| `PORT` | Host port (default `8005`). |
| `UID` / `GID` | Host user that owns the repos, so git can read and update them. |
| `GIT_CONFIG` | Git config mounted read-only into the container (default `~/.gitconfig`). |
| `GIT_CREDENTIALS` | Stored HTTPS credentials for fetch/pull (default `~/.git-credentials`, from `credential.helper store`). |

Fetch/pull never prompt for a password; repos without stored credentials report an error.

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

There is no login. Anyone who can reach the port can read the code and diffs inside `ALLOW_ROOT`, and trigger fetch/pull using your stored git credentials. Run it only on a trusted network.
