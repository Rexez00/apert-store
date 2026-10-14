import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { gql } from 'graphql-tag';
import { paypalCheckoutHandler } from './paypal.handler';
import { PaypalShopResolver } from './paypal.resolver';
import { PaypalService } from './paypal.service';

/**
 * PayPal Checkout (wallet + guest cards) for the APERT store.
 *
 * Setup:
 * 1. Create a PayPal developer REST app (sandbox for testing) at
 *    https://developer.paypal.com/ and copy the client ID + secret.
 * 2. Create a payment method with handler `paypal-checkout` and set its
 *    args (clientId / clientSecret / sandbox). The seed script does this
 *    automatically from PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET env vars.
 * 3. Storefront: render PayPal Buttons with the sandbox/live client id,
 *    call `createPaypalOrder` on approve-init and `capturePaypalOrder`
 *    on approval. No webhooks needed — capture is synchronous.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [PaypalService],
    shopApiExtensions: {
        schema: gql`
            extend type Mutation {
                createPaypalOrder: String!
                capturePaypalOrder(paypalOrderId: String!): Order!
            }
        `,
        resolvers: [PaypalShopResolver],
    },
    configuration: config => {
        config.paymentOptions.paymentMethodHandlers.push(paypalCheckoutHandler);
        return config;
    },
})
export class PaypalPlugin {}
