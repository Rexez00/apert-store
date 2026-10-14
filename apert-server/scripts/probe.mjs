const res = await fetch('http://localhost:3002/admin-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{__type(name:"Mutation"){fields{name type{kind name ofType{kind name ofType{kind name ofType{kind name}}}}}}}' }),
});
const j = await res.json();
const want = ['login', 'createCountry', 'createZone', 'createTaxCategory', 'createTaxRate', 'updateChannel', 'createStockLocation', 'createShippingMethod', 'createPaymentMethod', 'createAssets', 'createProduct', 'createProductVariants', 'assignProductsToChannel', 'updateProduct'];
const map = {};
j.data.__type.fields.forEach(f => { map[f.name] = f.type; });
const fmt = t => {
    if (!t) return '?';
    if (t.kind === 'NON_NULL') return fmt(t.ofType) + '!';
    if (t.kind === 'LIST') return '[' + fmt(t.ofType) + ']';
    return t.name || t.kind;
};
want.forEach(n => console.log(n, '=>', map[n] ? fmt(map[n]) : 'MISSING'));
