const res = await fetch('http://localhost:3002/shop-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{__type(name:"Mutation"){fields{name}}}' }),
});
const j = await res.json();
const names = j.data.__type.fields.map(f => f.name);
console.log('paypal mutations:', names.filter(n => /paypal/i.test(n)).join(', ') || 'MISSING');
