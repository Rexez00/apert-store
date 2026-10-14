import { LanguageCode, PaymentMethodHandler } from '@vendure/core';

/**
 * PayPal Checkout payment handler.
 *
 * The actual PayPal approval + capture happens in the shop mutations
 * (see paypal.resolver.ts), which verify everything with PayPal's API
 * before recording the payment — so createPayment trusts that metadata.
 */
export const paypalCheckoutHandler = new PaymentMethodHandler({
    code: 'paypal-checkout',
    description: [{ languageCode: LanguageCode.en, value: 'PayPal (wallet + cards)' }],
    args: {
        clientId: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Client ID' }],
            description: [{ languageCode: LanguageCode.en, value: 'PayPal REST app client ID (sandbox for testing)' }],
        },
        clientSecret: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Client secret' }],
            ui: { component: 'password-form-input' },
        },
        sandbox: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Sandbox mode' }],
            description: [{ languageCode: LanguageCode.en, value: 'Set to "true" for testing, "false" for live' }],
            defaultValue: 'true',
        },
    },
    createPayment(ctx, order, amount, args, metadata) {
        const captureId = (metadata as any)?.captureId || (metadata as any)?.paypalOrderId || order.code;
        return {
            amount,
            state: 'Settled' as const,
            transactionId: String(captureId),
            metadata,
        };
    },
    settlePayment() {
        return { success: true };
    },
});
