// Replicates exactly what index.html + checkout.html query on load.
const API = 'http://localhost:3002/shop-api';
async function gql(query, variables = {}) {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
    return json.data;
}
const d = await gql(`{product(slug:"apert-fisheye-170"){id assets{id preview} featuredAsset{id preview} variantList{items{id sku price priceWithTax stockLevel customFields{listPrice}}}}
activeOrder{id state totalWithTax lines{id quantity linePriceWithTax productVariant{id name}}}}`);
const v = d.product.variantList.items[0];
console.log('price:', v.price, '| priceWithTax:', v.priceWithTax, '| compare:', v.customFields.listPrice, '| stock:', v.stockLevel);
console.log('featured:', d.product.featuredAsset.preview);
console.log('assets:', d.product.assets.length);
console.log('activeOrder:', d.activeOrder ? d.activeOrder.state : null);
if (v.priceWithTax !== 499) throw new Error('bad price');
if (!/assets\/preview\//.test(d.product.featuredAsset.preview)) throw new Error('bad asset url');
console.log('FRONTEND-QUERIES OK');
