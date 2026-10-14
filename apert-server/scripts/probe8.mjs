for (const p of ['/dashboard', '/dashboard/', '/health']) {
    const r = await fetch('http://localhost:3002' + p);
    const t = await r.text();
    console.log(p, r.status, r.headers.get('content-type'), 'len:' + t.length, 'app:' + (t.includes('index-') || t.includes('/assets/')));
}
