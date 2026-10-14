const API = 'http://localhost:3002/shop-api';
async function gql(query) {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    return res.json();
}
const j = await gql('{ a: __type(name:"ProductVariant"){ fields { name } } b: __type(name:"Asset"){ fields { name } } c: __type(name:"Query"){ fields { name } } }');
if (j.errors) { console.log(JSON.stringify(j.errors, null, 2)); process.exit(1); }
const names = t => t.fields.map(f => f.name);
console.log('PV:', names(j.data.a).join(', '));
console.log('ASSET:', names(j.data.b).join(', '));
console.log('HAS product/activeOrder:', names(j.data.c).filter(n => /product|activeOrder|eligibleShipping|paymentMethods|order/i.test(n)).join(', '));
