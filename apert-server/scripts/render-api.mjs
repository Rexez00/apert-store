// Minimal Render REST API helper.
// Usage: $env:RENDER_API_KEY='...'; node scripts/render-api.mjs <cmd> [args]
//   cmds: owners | repos | create | get <id> | deploys <id> | deploy <id> | env <id>
const KEY = process.env.RENDER_API_KEY;
if (!KEY) { console.error('RENDER_API_KEY missing'); process.exit(1); }
const BASE = 'https://api.render.com/v1';

async function call(method, path, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error(`HTTP ${res.status}:`, JSON.stringify(json).slice(0, 800));
        process.exit(1);
    }
    return json;
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'owners') {
    const owners = await call('GET', '/owners?limit=20');
    console.log(JSON.stringify(owners.map(o => ({ id: o.owner?.id || o.id, name: o.owner?.name || o.name, type: (o.owner && o.owner.type) || o.type })), null, 2));
} else if (cmd === 'repos') {
    const repos = await call('GET', '/repos?limit=100');
    console.log(JSON.stringify(repos.map(r => r.repo?.fullName || r.fullName || r), null, 2).slice(0, 2000));
} else if (cmd === 'create') {
    // arg: JSON file or env-driven; expects OWNER_ID env
    const ownerId = process.env.RENDER_OWNER_ID;
    if (!ownerId) { console.error('RENDER_OWNER_ID missing'); process.exit(1); }
    const svc = await call('POST', '/services', {
        type: 'web_service',
        name: 'apert',
        ownerId,
        repo: 'https://github.com/Rexez00/apert-store',
        branch: 'main',
        autoDeploy: 'yes',
        serviceDetails: {
            runtime: 'docker',
            dockerfilePath: './Dockerfile',
            plan: 'free',
            region: 'virginia',
            healthCheckPath: '/health',
            envVars: [
                { key: 'APP_ENV', value: 'production' },
                { key: 'DATABASE_URL', value: process.env.DEPLOY_DATABASE_URL || '' },
                { key: 'COOKIE_SECRET', value: process.env.DEPLOY_COOKIE_SECRET || '' },
                { key: 'SUPERADMIN_USERNAME', value: process.env.DEPLOY_SUPERADMIN_USERNAME || 'superadmin' },
                { key: 'SUPERADMIN_PASSWORD', value: process.env.DEPLOY_SUPERADMIN_PASSWORD || 'superadmin' },
                { key: 'PUBLIC_URL', value: process.env.DEPLOY_PUBLIC_URL || '' },
            ],
        },
    });
    console.log(JSON.stringify({ id: svc.service?.id, name: svc.service?.name, url: svc.service?.serviceDetails?.url }, null, 2));
} else if (cmd === 'get') {
    console.log(JSON.stringify(await call('GET', `/services/${arg}`), null, 2).slice(0, 1500));
} else if (cmd === 'deploys') {
    const d = await call('GET', `/services/${arg}/deploys?limit=5`);
    console.log(JSON.stringify(d.map(x => ({ id: x.deploy?.id, status: x.deploy?.status, created: x.deploy?.createdAt, url: x.deploy?.url })), null, 2));
} else if (cmd === 'deploy') {
    console.log(JSON.stringify(await call('POST', `/services/${arg}/deploys`, { clearCache: 'clear' }), null, 2).slice(0, 800));
} else {
    console.error('unknown cmd');
    process.exit(1);
}
