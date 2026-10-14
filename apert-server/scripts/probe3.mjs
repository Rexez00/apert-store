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
const j = await gql('{ shippingCalculators { code args { name type } } }');
console.log(JSON.stringify(j.data ?? j, null, 2));
