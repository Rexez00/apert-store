const API = 'http://localhost:3002/admin-api';
let token = null;
async function gql(query) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query }) });
    const t = res.headers.get('vendure-auth-token');
    if (t) token = t;
    return res.json();
}
await gql(`mutation { login(username: "superadmin", password: "superadmin") { __typename } }`);
const j = await gql('{ a: __type(name:"CreateProductVariantInput"){ inputFields { name type { kind name ofType { kind name } } } } b: __type(name:"ProductVariant"){ fields { name } } }');
const f = t => (!t ? '?' : t.kind === 'NON_NULL' ? f(t.ofType) + '!' : t.kind === 'LIST' ? '[' + f(t.ofType) + ']' : (t.name || t.kind));
console.log('INPUT:', j.data.a.inputFields.map(f2 => f2.name + ':' + f(f2.type)).join(', '));
console.log('VARIANT price-ish:', j.data.b.fields.map(f2 => f2.name).filter(n => /price|list|compare|retail/i.test(n)).join(', '));
