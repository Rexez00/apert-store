// Seeds the APERT store: channel settings, tax, free shipping,
// demo payment, product + variant + assets. Safe to re-run (query-first).
const API = process.env.VENDURE_API || 'http://localhost:3002/admin-api';
const SHOP = API.replace('/admin-api', '/shop-api');
const USER = process.env.SUPERADMIN_USERNAME || 'superadmin';
const PASS = process.env.SUPERADMIN_PASSWORD || 'superadmin';

let authToken = null;
let channelToken = null;

async function gql(query, variables = {}, useChannel = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    if (useChannel && channelToken) headers['vendure-token'] = channelToken;
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const tok = res.headers.get('vendure-auth-token');
    if (tok) authToken = tok;
    const json = await res.json();
    if (json.errors) throw new Error('GraphQL errors: ' + JSON.stringify(json.errors, null, 2));
    return json.data;
}

const log = (...a) => console.log('[seed]', ...a);

async function main() {
    // 1. login
    const login = await gql(
        `mutation Login($u: String!, $p: String!) {
            login(username: $u, password: $p) {
                __typename
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { u: USER, p: PASS },
        false,
    );
    if (login.login.__typename !== 'CurrentUser') throw new Error('Login failed: ' + JSON.stringify(login.login));
    log('logged in as', login.login.identifier);

    // 2. default channel
    const { channels } = await gql(`{ channels { items { id code token defaultTaxZone { id } defaultShippingZone { id } currencyCode pricesIncludeTax } } }`, {}, false);
    const channel = channels.items[0];
    if (!channel) throw new Error('No channel found');
    channelToken = channel.token;
    log('channel:', channel.code, '| currency:', channel.currencyCode, '| pricesIncludeTax:', channel.pricesIncludeTax);

    // 3. countries
    const wanted = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France' };
    const { countries } = await gql(`{ countries { items { id code } } }`);
    const have = new Map(countries.items.map(c => [c.code, c.id]));
    for (const [code, name] of Object.entries(wanted)) {
        if (!have.has(code)) {
            const r = await gql(
                `mutation CC($i: CreateCountryInput!) { createCountry(input: $i) { id code } }`,
                { i: { code, enabled: true, translations: [{ languageCode: 'en', name }] } },
            );
            if (!r.createCountry || !r.createCountry.id) throw new Error('createCountry failed: ' + JSON.stringify(r.createCountry));
            have.set(code, r.createCountry.id);
            log('created country', code);
        }
    }

    // 4. zone "Global" with all countries
    let { zones } = await gql(`{ zones { items { id name members { ... on Country { id code } } } } }`);
    let zone = zones.items.find(z => z.name === 'Global');
    const memberIds = [...have.values()];
    if (!zone) {
        const r = await gql(
            `mutation CZ($i: CreateZoneInput!) { createZone(input: $i) { id name } }`,
            { i: { name: 'Global', memberIds } },
        );
        if (!r.createZone || !r.createZone.id) throw new Error('createZone failed: ' + JSON.stringify(r.createZone));
        zone = r.createZone;
        log('created zone Global');
    } else {
        log('zone Global exists');
    }

    // 5. tax category + 0% rate (keeps $4.99 total exact)
    let { taxCategories } = await gql(`{ taxCategories { items { id name } } }`);
    let cat = taxCategories.items.find(t => t.name === 'Standard');
    if (!cat) {
        const r = await gql(
            `mutation TC($i: CreateTaxCategoryInput!) { createTaxCategory(input: $i) { id name } }`,
            { i: { name: 'Standard' } },
        );
        if (!r.createTaxCategory || !r.createTaxCategory.id) throw new Error('createTaxCategory failed: ' + JSON.stringify(r.createTaxCategory));
        cat = r.createTaxCategory;
        log('created tax category Standard');
    }
    let { taxRates } = await gql(`{ taxRates { items { id name } } }`);
    if (!taxRates.items.some(t => t.name === 'Zero Tax')) {
        const r = await gql(
            `mutation TR($i: CreateTaxRateInput!) { createTaxRate(input: $i) { id name } }`,
            { i: { name: 'Zero Tax', enabled: true, value: 0, categoryId: cat.id, zoneId: zone.id } },
        );
        if (!r.createTaxRate || !r.createTaxRate.id) throw new Error('createTaxRate failed: ' + JSON.stringify(r.createTaxRate));
        log('created 0% tax rate');
    }

    // 6. channel defaults
    if (!channel.defaultTaxZone || !channel.defaultShippingZone || channel.pricesIncludeTax !== true || channel.currencyCode !== 'USD') {
        const r = await gql(
            `mutation UC($i: UpdateChannelInput!) { updateChannel(input: $i) { __typename ... on Channel { id } ... on ErrorResult { errorCode message } } }`,
            { i: { id: channel.id, currencyCode: 'USD', pricesIncludeTax: true, defaultTaxZoneId: zone.id, defaultShippingZoneId: zone.id } },
        );
        if (r.updateChannel.__typename !== 'Channel') throw new Error('updateChannel failed: ' + JSON.stringify(r.updateChannel));
        log('channel defaults set (USD, tax-included, Global zones)');
    } else {
        log('channel defaults already set');
    }

    // 7. stock location
    let { stockLocations } = await gql(`{ stockLocations { items { id name } } }`);
    let stockLocation = stockLocations.items[0];
    if (!stockLocation) {
        const r = await gql(
            `mutation SL($i: CreateStockLocationInput!) { createStockLocation(input: $i) { id name } }`,
            { i: { name: 'Default warehouse' } },
        );
        if (!r.createStockLocation || !r.createStockLocation.id) throw new Error('createStockLocation failed: ' + JSON.stringify(r.createStockLocation));
        stockLocation = r.createStockLocation;
        log('created stock location');
    }

    // 8. free shipping method
    const elig = await gql(`{ shippingEligibilityCheckers { code args { name type } } }`, {}, false);
    log('eligibility checkers:', elig.shippingEligibilityCheckers.map(c => c.code).join(', '));
    const fulfill = await gql(`{ fulfillmentHandlers { code args { name type } } }`, {}, false);
    log('fulfillment handlers:', fulfill.fulfillmentHandlers.map(c => c.code).join(', '));
    let { shippingMethods } = await gql(`{ shippingMethods { items { id code } } }`);
    if (!shippingMethods.items.some(s => s.code === 'free-shipping')) {
        const r = await gql(
            `mutation SM($i: CreateShippingMethodInput!) { createShippingMethod(input: $i) { id code } }`,
            {
                i: {
                    code: 'free-shipping',
                    fulfillmentHandler: 'manual-fulfillment',
                    checker: { code: 'default-shipping-eligibility-checker', arguments: [{ name: 'orderMinimum', value: '0' }] },
                    calculator: { code: 'default-shipping-calculator', arguments: [{ name: 'rate', value: '0' }, { name: 'includesTax', value: 'include' }, { name: 'taxRate', value: '0' }] },
                    translations: [{ languageCode: 'en', name: 'Standard', description: '' }],
                },
            },
        );
        if (!r.createShippingMethod || !r.createShippingMethod.id) throw new Error('createShippingMethod failed: ' + JSON.stringify(r.createShippingMethod));
        log('created free shipping method');
    } else {
        log('free shipping method exists');
    }

    // 9. demo payment method
    const pmh = await gql(`{ paymentMethodHandlers { code args { name type } } }`, {}, false);
    log('payment handlers:', pmh.paymentMethodHandlers.map(c => c.code).join(', '));
    let { paymentMethods } = await gql(`{ paymentMethods { items { id code } } }`);
    if (!paymentMethods.items.some(p => p.code === 'apert-demo-card')) {
        const r = await gql(
            `mutation PM($i: CreatePaymentMethodInput!) { createPaymentMethod(input: $i) { id code } }`,
            { i: { code: 'apert-demo-card', enabled: true, handler: { code: 'dummy-payment-handler', arguments: [{ name: 'automaticSettle', value: 'true' }] }, translations: [{ languageCode: 'en', name: 'Demo card', description: '' }] } },
        );
        if (!r.createPaymentMethod || !r.createPaymentMethod.id) throw new Error('createPaymentMethod failed: ' + JSON.stringify(r.createPaymentMethod));
        log('created payment method apert-demo-card (auto-settle)');
    } else {
        log('payment method exists');
    }

    // 9b. PayPal Checkout (only when sandbox/live creds provided via env)
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
        let { paymentMethods: pms2 } = await gql(`{ paymentMethods { items { id code } } }`);
        if (!pms2.items.some(p => p.code === 'apert-paypal')) {
            const r = await gql(
                `mutation PM($i: CreatePaymentMethodInput!) { createPaymentMethod(input: $i) { id code } }`,
                {
                    i: {
                        code: 'apert-paypal',
                        enabled: true,
                        handler: {
                            code: 'paypal-checkout',
                            arguments: [
                                { name: 'clientId', value: process.env.PAYPAL_CLIENT_ID },
                                { name: 'clientSecret', value: process.env.PAYPAL_CLIENT_SECRET },
                                { name: 'sandbox', value: process.env.PAYPAL_SANDBOX || 'true' },
                            ],
                        },
                        translations: [{ languageCode: 'en', name: 'PayPal', description: '' }],
                    },
                },
            );
            if (!r.createPaymentMethod || !r.createPaymentMethod.id) throw new Error('createPaymentMethod(paypal) failed: ' + JSON.stringify(r.createPaymentMethod));
            log('created payment method apert-paypal');
        } else {
            log('paypal payment method exists');
        }
    } else {
        log('PAYPAL_* keys absent — skipping PayPal payment method');
    }
    const path = await import('path');
    const fs = await import('fs');
    const storeDir = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..', '..'));
    const files = [
        'Product pics/Fisheye_lens_product_photography_20261003174321.jpg',
        'Product pics/Expand_image_into_square_20261013223635.jpg',
        'Product pics/Expand_image_into_square_20261013223631.jpg',
        'Product pics/Expand_image_into_square_20261013223643.jpg',
    ].map(f => path.join(storeDir, f));
    for (const f of files) {
        if (!fs.existsSync(f)) throw new Error('Missing image: ' + f);
    }
    const { products } = await gql(`{ products { items { id slug } } }`);
    let product = products.items.find(p => p.slug === 'apert-fisheye-170');
    let assetIds;
    if (product) {
        // On ephemeral hosts (free tiers) uploaded files can vanish on redeploy
        // while DB rows survive — re-upload + relink if any image 404s.
        try {
            const pv = await gql(`{ product(id: "${product.id}") { assets { id preview } } }`);
            const urls = (pv.product?.assets || []).map(a => a.preview);
            let missing = false;
            for (const u of urls) {
                try {
                    const abs = u.startsWith('http') ? u : SHOP.replace('/shop-api', '') + u;
                    const r = await fetch(abs, { method: 'HEAD' });
                    if (!r.ok) { missing = true; break; }
                } catch { missing = true; break; }
            }
            if (missing) {
                log('assets missing on disk — re-uploading');
                product._relink = true;
            } else {
                log('product already exists with healthy assets');
            }
        } catch { log('asset check skipped'); }
        assetIds = [];
    }
    if (!product || product._relink) {
        const form = new FormData();
        const ops = { query: `mutation CA($input: [CreateAssetInput!]!) { createAssets(input: $input) { __typename ... on Asset { id preview } ... on ErrorResult { errorCode message } } }`, variables: { input: files.map(() => ({})) } };
        form.append('operations', JSON.stringify(ops));
        const map = {};
        files.forEach((_, i) => { map[String(i)] = [`variables.input.${i}.file`]; });
        form.append('map', JSON.stringify(map));
        files.forEach((f, i) => {
            const buf = fs.readFileSync(f);
            const type = f.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            form.append(String(i), new Blob([buf], { type }), path.basename(f));
        });
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        if (channelToken) headers['vendure-token'] = channelToken;
        const res = await fetch(API, { method: 'POST', headers, body: form });
        const tok = res.headers.get('vendure-auth-token');
        if (tok) authToken = tok;
        const json = await res.json();
        if (json.errors) throw new Error('createAssets errors: ' + JSON.stringify(json.errors, null, 2));
        const created = json.data.createAssets;
        const bad = created.filter(a => a.__typename !== 'Asset');
        if (bad.length) throw new Error('createAssets failed: ' + JSON.stringify(bad, null, 2));
        assetIds = created.map(a => a.id);
        log('uploaded assets:', assetIds.join(', '));
    }

    // 11. product (+ variant if missing)
    let variants = [];
    if (!product) {
        const r = await gql(
            `mutation CP($i: CreateProductInput!) { createProduct(input: $i) { id slug enabled } }`,
            {
                i: {
                    assetIds,
                    featuredAssetId: assetIds[0],
                    translations: [{
                        languageCode: 'en',
                        name: 'APERT Fisheye 170°',
                        slug: 'apert-fisheye-170',
                        description: 'True 170° fisheye lens for any phone. HD glass, universal clip.',
                    }],
                },
            },
        );
        if (!r.createProduct || !r.createProduct.id) throw new Error('createProduct failed: ' + JSON.stringify(r.createProduct));
        product = r.createProduct;
        log('created product', product.slug);
        try {
            await gql(`mutation AP($i: AssignProductsToChannelInput!) { assignProductsToChannel(input: $i) { id } }`,
                { i: { productIds: [product.id], channelId: channel.id } });
            log('assigned product to channel');
        } catch (e) {
            log('assignProductsToChannel skipped:', String(e).slice(0, 160));
        }
    } else {
        log('product already exists:', product.slug);
        if (product._relink && assetIds.length) {
            const up = await gql(
                `mutation UP($i: UpdateProductInput!) { updateProduct(input: $i) { id slug } }`,
                { i: { id: product.id, assetIds, featuredAssetId: assetIds[0] } },
            );
            if (!up.updateProduct || !up.updateProduct.id) throw new Error('relink failed: ' + JSON.stringify(up.updateProduct));
            log('relinked product images');
        }
        const pv = await gql(`{ product(id: "${product.id}") { variantList { items { id } } } }`);
        variants = pv.product?.variantList?.items || [];
    }
    if (!variants.length) {
        const v = await gql(
            `mutation CV($i: [CreateProductVariantInput!]!) { createProductVariants(input: $i) { id sku price } }`,
            {
                i: [{
                    productId: product.id,
                    sku: 'APERT-FISHEYE-170',
                    price: 499,
                    stockLevels: [{ stockOnHand: 100, stockLocationId: stockLocation.id }],
                    trackInventory: 'TRUE',
                    translations: [{ languageCode: 'en', name: 'APERT Fisheye 170°' }],
                    customFields: { listPrice: 899 },
                }],
            },
        );
        const badV = v.createProductVariants.filter(x => !x || !x.id);
        if (badV.length) throw new Error('createProductVariants failed: ' + JSON.stringify(badV, null, 2));
        log('created variant', v.createProductVariants[0].sku, 'price', v.createProductVariants[0].price);
    } else {
        log('variant already exists, skipping create');
    }

    // 12. verify via shop api
    const shop = await (async () => {
        const res = await fetch(SHOP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `{ product(slug: "apert-fisheye-170") { id slug variantList { items { id sku price priceWithTax stockLevel } } } }` }),
        });
        return res.json();
    })();
    log('shop product:', JSON.stringify(shop.data?.product?.variantList?.items));
    log('DONE — store is seeded');
}

main().catch(e => { console.error('[seed] FATAL', e.message || e); process.exit(1); });
