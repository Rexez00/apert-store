// Usage: $env:GITHUB_TOKEN='<token>'; node scripts/gh-push.mjs [repo-name]
// Verifies token, creates private repo if missing, pushes main.
const repoWanted = process.argv[2] || 'apert-store';
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN missing'); process.exit(1); }
const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'apert-deploy',
};
async function api(method, path, body) {
    const res = await fetch('https://api.github.com' + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}
const me = await api('GET', '/user');
if (me.status !== 200) { console.error('token invalid:', JSON.stringify(me.json).slice(0, 200)); process.exit(1); }
console.log('token OK for user:', me.json.login);
let repo = await api('GET', `/repos/${me.json.login}/${repoWanted}`);
if (repo.status === 404) {
    repo = await api('POST', '/user/repos', { name: repoWanted, private: true, description: 'APERT fisheye lens store (Vendure backend + static storefront)' });
    if (repo.status !== 201) { console.error('create failed:', JSON.stringify(repo.json).slice(0, 300)); process.exit(1); }
    console.log('repo created:', repo.json.full_name);
} else {
    console.log('repo exists:', repo.json.full_name);
}
console.log('PUSH_URL=' + `https://${me.json.login}@github.com/${me.json.login}/${repoWanted}.git`);
