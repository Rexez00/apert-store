// Reproduces the BROWSER checkout flow exactly: cookie session (not bearer),
// same mutation sequence as checkout.html collectDetails + createPaypalOrder.
const BASE = process.env.STORE_URL || 'http://localhost:3002';
let cookie = '';
async function api(query, variables = {}) {
    const res = await fetch(BASE + '/shop-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ query, variables }),
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
        const pair = c.split(';')[0];
        const name = pair.split('=')[0];
        const others = cookie.split(/; /).filter(p => !p.startsWith(name + '='));
        others.push(pair);
        cookie = others.join('; ');
    }
    const json = await res.json();
    if (json.errors) throw new Error('GQL: ' + JSON.stringify(json.errors).slice(0, 400));
    return json.data;
}
function needOrder(v, op) {
    if (!v || v.__typename !== 'Order') throw new Error(`${op}: ${v?.errorCode || ''} ${v?.message || v?.transitionError || ''}`.trim());
    return v;
}
async function main() {
    const p = await api(`{ product(slug:"apert-fisheye-170"){ variantList { items { id } } } }`);
    const vid = p.product.variantList.items[0].id;
    needOrder((await api(`mutation($id:ID!){addItemToOrder(productVariantId:$id,quantity:1){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`, { id: vid })).addItemToOrder, 'add');
    console.log('bag ok, cookie:', cookie.slice(0, 60) + '...');
    needOrder((await api(`mutation{setCustomerForOrder(input:{emailAddress:"browser-sim@example.com",firstName:"Sim",lastName:"User"}){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`)).setCustomerForOrder, 'customer');
    needOrder((await api(`mutation{setOrderShippingAddress(input:{fullName:"Sim User",streetLine1:"5 Test Rd",city:"Austin",postalCode:"73301",countryCode:"US"}){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`)).setOrderShippingAddress, 'address');
    const m = await api(`{eligibleShippingMethods{id code}}`);
    console.log('ship methods:', JSON.stringify(m.eligibleShippingMethods));
    needOrder((await api(`mutation($id:[ID!]!){setOrderShippingMethod(shippingMethodId:$id){__typename ...on Order{id state} ...on ErrorResult{errorCode message}}}`, { id: [m.eligibleShippingMethods[0].id] })).setOrderShippingMethod, 'shipmethod');
    needOrder((await api(`mutation{transitionOrderToState(state:"ArrangingPayment"){__typename ...on Order{id state} ...on OrderStateTransitionError{errorCode message transitionError}}}`)).transitionOrderToState, 'arranging');
    const d = await api(`mutation{createPaypalOrder}`);
    console.log('PAYPAL ORDER:', d.createPaypalOrder);
    console.log('BROWSER-FLOW OK');
}
main().catch(e => { console.error('BROWSER-FLOW FAIL:', e.message); process.exit(1); });
