// PayPal handshake test: full guest flow through to createPaypalOrder.
// Proves credentials + plugin + PayPal sandbox API all work.
// Usage: node scripts/test-paypal.mjs
const API = process.env.VENDURE_SHOP_API || 'http://localhost:3002/shop-api';
let authToken = null;

async function gql(query, variables = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const tok = res.headers.get('vendure-auth-token');
    if (tok) authToken = tok;
    const json = await res.json();
    if (json.errors) throw new Error('GraphQL errors: ' + JSON.stringify(json.errors, null, 2));
    return json.data;
}

function needOrder(v, op) {
    if (!v || v.__typename !== 'Order') throw new Error(`${op}: ${v?.errorCode || ''} ${v?.message || v?.transitionError || ''}`.trim());
    return v;
}

async function main() {
    const p = await gql(`{ product(slug: "apert-fisheye-170") { variantList { items { id } } } }`);
    const variantId = p.product.variantList.items[0].id;
    needOrder((await gql(`mutation($id:ID!){addItemToOrder(productVariantId:$id,quantity:1){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`,
        { id: variantId })).addItemToOrder, 'add');
    needOrder((await gql(`mutation{setCustomerForOrder(input:{emailAddress:"paypal-test@example.com",firstName:"Pay",lastName:"Pal"}){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`)).setCustomerForOrder, 'customer');
    needOrder((await gql(`mutation{setOrderShippingAddress(input:{fullName:"Pay Pal",streetLine1:"1 Test St",city:"LA",postalCode:"90001",countryCode:"US"}){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`)).setOrderShippingAddress, 'address');
    const m = await gql(`{eligibleShippingMethods{id}}`);
    needOrder((await gql(`mutation($id:[ID!]!){setOrderShippingMethod(shippingMethodId:$id){__typename ...on Order{id} ...on ErrorResult{errorCode message}}}`, { id: [m.eligibleShippingMethods[0].id] })).setOrderShippingMethod, 'shipping');
    needOrder((await gql(`mutation{transitionOrderToState(state:"ArrangingPayment"){__typename ...on Order{id state} ...on OrderStateTransitionError{errorCode message transitionError}}}`)).transitionOrderToState, 'arranging');
    const d = await gql(`mutation{createPaypalOrder}`);
    if (!d.createPaypalOrder || typeof d.createPaypalOrder !== 'string') throw new Error('No PayPal order id returned');
    console.log('[paypal-test] PayPal order created:', d.createPaypalOrder);
    console.log('[paypal-test] PASS — handshake works (approve + capture next)');
}

main().catch(e => { console.error('[paypal-test] FAIL:', e.message); process.exit(1); });
