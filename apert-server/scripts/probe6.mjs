for (const p of ['/index.html', '/', '/checkout.html', '/Product%20pics/sample1_expanded.jpg']) {
    try {
        const r = await fetch('http://localhost:3002' + p);
        console.log(p, r.status, r.headers.get('content-type'));
    } catch (e) {
        console.log(p, 'ERR', e.message);
    }
}
