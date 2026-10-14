// End-to-end shop test: product -> cart -> address -> shipping -> payment -> placed.
// Usage: node scripts/test-order.mjs
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

function unwrap(result, field) {
    const r = result[field];
    if (r && r.__typename && /Error/.test(r.__typename)) {
        throw new Error(`${field} failed: ${r.errorCode} — ${r.message || ''}`);
    }
    return r;
}

const ORDER_FRAG = `
    id code state totalWithTax currencyCode
    lines { id quantity linePriceWithTax productVariant { id sku } }
`;

async function main() {
    // 1. product
    const p = await gql(`{ product(slug: "apert-fisheye-170") {
        id slug
        variantList { items { id sku price priceWithTax stockLevel customFields { listPrice } } }
    } }`);
    if (!p.product) throw new Error('Product not found');
    const v = p.product.variantList.items[0];
    console.log('[test] variant:', v.sku, '| price:', v.price, '| priceWithTax:', v.priceWithTax, '| stock:', v.stockLevel);
    if (v.price !== 499) throw new Error(`Expected price 499, got ${v.price}`);

    // 2. add to order
    const added = unwrap(await gql(
        `mutation A($id: ID!, $q: Int!) { addItemToOrder(productVariantId: $id, quantity: $q) {
            __typename ... on Order { ${ORDER_FRAG} } ... on ErrorResult { errorCode message } } }`,
        { id: v.id, q: 2 },
    ), 'addItemToOrder');
    console.log('[test] cart total:', added.totalWithTax, '| lines:', added.lines.length);

    // 3. customer + address
    unwrap(await gql(
        `mutation C($i: CreateCustomerInput!) { setCustomerForOrder(input: $i) {
            __typename ... on Order { id } ... on ErrorResult { errorCode message } } }`,
        { i: { emailAddress: 'buyer@example.com', firstName: 'Test', lastName: 'Buyer' } },
    ), 'setCustomerForOrder');
    unwrap(await gql(
        `mutation SA($i: CreateAddressInput!) { setOrderShippingAddress(input: $i) {
            __typename ... on Order { id } ... on ErrorResult { errorCode message } } }`,
        { i: { fullName: 'Test Buyer', streetLine1: '12 Skate Ave', city: 'Los Angeles', postalCode: '90001', countryCode: 'US' } },
    ), 'setOrderShippingAddress');
    console.log('[test] customer + address set');

    // 4. shipping
    const methods = await gql(`{ eligibleShippingMethods { id code name price } }`);
    if (!methods.eligibleShippingMethods.length) throw new Error('No eligible shipping methods');
    console.log('[test] shipping methods:', methods.eligibleShippingMethods.map(m => `${m.code} (${m.price})`).join(', '));
    const withShip = unwrap(await gql(
        `mutation SS($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) {
            __typename ... on Order { ${ORDER_FRAG} } ... on ErrorResult { errorCode message } } }`,
        { id: [methods.eligibleShippingMethods[0].id] },
    ), 'setOrderShippingMethod');
    console.log('[test] state after shipping:', withShip.state, '| total:', withShip.totalWithTax);

    // 4b. move to ArrangingPayment
    const arranging = unwrap(await gql(
        `mutation T($s: String!) { transitionOrderToState(state: $s) {
            __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message transitionError } } }`,
        { s: 'ArrangingPayment' },
    ), 'transitionOrderToState');
    console.log('[test] state:', arranging.state);

    // 5. payment
    const pms = await gql(`{ eligiblePaymentMethods { id code name } }`);
    const pm = pms.eligiblePaymentMethods.find(m => m.code === 'apert-demo-card') || pms.eligiblePaymentMethods[0];
    if (!pm) throw new Error('No payment methods');
    let order = unwrap(await gql(
        `mutation P($i: PaymentInput!) { addPaymentToOrder(input: $i) {
            __typename ... on Order { ${ORDER_FRAG} } ... on ErrorResult { errorCode message } } }`,
        { i: { method: pm.code, metadata: {} } },
    ), 'addPaymentToOrder');
    console.log('[test] state after payment:', order.state);

    // 6. settle if needed
    if (order.state === 'PaymentAuthorized') {
        order = unwrap(await gql(
            `mutation T($s: String!) { transitionOrderToState(state: $s) {
                __typename ... on Order { ${ORDER_FRAG} } ... on OrderStateTransitionError { errorCode message transitionError } } }`,
            { s: 'PaymentSettled' },
        ), 'transitionOrderToState');
    }
    console.log('[test] FINAL state:', order.state, '| code:', order.code, '| total:', order.totalWithTax);
    if (!order.code) throw new Error('Order has no code — not placed');
    if (!['PaymentSettled', 'PaymentAuthorized', 'Shipped', 'Delivered'].includes(order.state)) {
        throw new Error('Unexpected final state: ' + order.state);
    }
    console.log('[test] PASS — real order placed:', order.code);
}

main().catch(e => { console.error('[test] FAIL:', e.message); process.exit(1); });
