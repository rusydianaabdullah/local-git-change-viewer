// Simple view-only git viewer. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.resolve(process.env.PROJECTS_DIR || process.cwd());
// Folders added from settings must live under this base.
const ALLOW_ROOT = path.resolve(process.env.ALLOW_ROOT || ROOT);
const PORT = process.env.PORT || 9005;
const MAX_DEPTH = 3;

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out));
  });
}

// Network git ops (fetch/pull) return output or error text; never prompt for credentials.
function gitRun(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out, errOut) =>
      resolve({ ok: !err, output: (out + errOut).trim() || (err ? String(err.message) : '') }));
  });
}

const SYNC = { fetch: ['fetch', '--all', '--prune'], pull: ['pull', '--ff-only'] };

function findRepos(dir, depth = 0, found = []) {
  if (depth > MAX_DEPTH) return found;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  if (entries.some((e) => e.name === '.git')) { found.push(dir); return found; }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') findRepos(path.join(dir, e.name), depth + 1, found);
  }
  return found;
}

async function repoStatus(root, dir) {
  const out = await git(dir, ['status', '--porcelain=v1', '-b']);
  const lines = out.split('\n').filter(Boolean);
  const head = lines.shift() || '';
  const branch = (head.match(/^## (?:No commits yet on )?([^.\s]+)/) || [])[1] || '?';
  const ahead = +((head.match(/ahead (\d+)/) || [])[1] || 0);
  const behind = +((head.match(/behind (\d+)/) || [])[1] || 0);
  const last = +(await git(dir, ['log', '-1', '--format=%ct'])).trim() || 0;
  return { name: path.relative(root, dir), path: dir, branch, changes: lines.length, ahead, behind, last };
}

function allowed(dir) {
  return dir === ALLOW_ROOT || dir.startsWith(ALLOW_ROOT + path.sep);
}

function resolveRepo(p) {
  const dir = path.resolve(ROOT, p || '');
  if (!allowed(dir) || !fs.existsSync(path.join(dir, '.git'))) return null;
  return dir;
}

async function changes(dir) {
  const status = await git(dir, ['status', '--porcelain=v1', '-uall']);
  const staged = await git(dir, ['diff', '--cached', '--no-color']);
  const unstaged = await git(dir, ['diff', '--no-color']);
  const files = status.split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2), path: l.slice(3) }));
  const diffs = splitDiff(staged + unstaged);
  for (const f of files) {
    const p = f.path.includes(' -> ') ? f.path.split(' -> ')[1] : f.path;
    f.diff = diffs[p] || '';
    if (f.code === '??') {
      try {
        const full = path.join(dir, p);
        const st = fs.statSync(full);
        f.diff = st.size > 512 * 1024 ? '(file too large)' : fs.readFileSync(full, 'utf8').split('\n').map((x) => '+' + x).join('\n');
      } catch { f.diff = ''; }
    }
  }
  return files;
}

function splitDiff(text) {
  const map = {};
  for (const part of text.split(/^(?=diff --git )/m)) {
    const m = part.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    if (m) map[m[2]] = (map[m[2]] ? map[m[2]] + '\n' : '') + part;
  }
  return map;
}

async function commitFiles(dir, hash) {
  const out = await git(dir, ['show', '--no-color', '--format=', '--name-status', hash]);
  const diffs = splitDiff(await git(dir, ['show', '--no-color', '--format=', hash]));
  return out.split('\n').filter(Boolean).map((l) => {
    const parts = l.split('\t');
    const p = parts[parts.length - 1];
    return { code: parts[0][0], path: parts.slice(1).join(' -> '), diff: diffs[p] || '' };
  });
}

async function commitInfo(dir, hash) {
  const fmt = '%H%x1f%an%x1f%ae%x1f%aD%x1f%ar%x1f%cn%x1f%ce%x1f%cD%x1f%P%x1f%D%x1f%B';
  const [full, author, email, date, ago, committer, cemail, cdate, parents, refs, message] = (await git(dir, ['show', '-s', `--format=${fmt}`, hash])).split('\x1f');
  return { full, author, email, date, ago, committer, cemail, cdate, parents, refs, message: (message || '').trim() };
}

async function graph(dir) {
  const fmt = '%h%x1f%p%x1f%D%x1f%an%x1f%ar%x1f%ae%x1f%B%x1e';
  const out = await git(dir, ['log', '--all', '--date-order', '--abbrev=7', '-n', '300', '--color=never', `--format=${fmt}`]);
  return out.split('\x1e').map((l) => l.replace(/^\n/, '')).filter(Boolean).map((l) => {
    const [hash, parents, refs, author, date, email, msg] = l.split('\x1f');
    // Subject is the first line only; everything after is the body.
    const [subject, ...rest] = (msg || '').trim().split('\n');
    return { hash, parents: parents ? parents.split(' ') : [], refs, subject, author, date, email, body: rest.join('\n').trim() };
  });
}

const STATIC = {
  '/manifest.webmanifest': 'application/manifest+json', '/sw.js': 'text/javascript', '/icon.svg': 'image/svg+xml',
  '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/icon-maskable.png': 'image/png', '/apple-touch-icon.png': 'image/png',
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = url.searchParams;
  try {
    if (url.pathname === '/') return send(res, 200, fs.readFileSync(path.join(__dirname, 'public/index.html')), 'text/html; charset=utf-8');
    const asset = STATIC[url.pathname];
    if (asset) return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', url.pathname)), asset);
    if (url.pathname === '/api/default-root') return send(res, 200, { root: ROOT });
    if (url.pathname === '/api/repos') {
      const root = path.resolve(q.get('root') || ROOT);
      if (!allowed(root)) return send(res, 403, { error: `folder must be under ${ALLOW_ROOT}` });
      if (!fs.existsSync(root)) return send(res, 404, { error: 'folder not found' });
      return send(res, 200, await Promise.all(findRepos(root).sort().map((d) => repoStatus(root, d))));
    }
    const dir = resolveRepo(q.get('repo'));
    if (!dir) return send(res, 404, { error: 'repo not found' });
    if (url.pathname === '/api/changes') return send(res, 200, await changes(dir));
    if (url.pathname === '/api/graph') return send(res, 200, await graph(dir));
    if (url.pathname === '/api/fetch' || url.pathname === '/api/pull') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      const r = await gitRun(dir, SYNC[url.pathname.slice(5)]);
      return send(res, r.ok ? 200 : 500, r);
    }
    if (url.pathname === '/api/commit') {
      const hash = q.get('hash') || '';
      if (!/^[0-9a-f]{4,40}$/.test(hash)) return send(res, 400, { error: 'bad hash' });
      const [info, files] = await Promise.all([commitInfo(dir, hash), commitFiles(dir, hash)]);
      return send(res, 200, { info, files });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
}).listen(PORT, '0.0.0.0', () => console.log(`gitviewer on :${PORT}, root ${ROOT}`));
