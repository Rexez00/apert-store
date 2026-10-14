// @ts-ignore TS1479: @nestjs/* ship ESM-only types, but Node 22+ handles require(esm) at runtime
import { Injectable } from '@nestjs/common';
import {
    LanguageCode,
    Logger,
    PaymentMethodService,
    RequestContext,
    UserInputError,
} from '@vendure/core';

export const loggerCtx = 'PaypalPlugin';

interface PaypalCredentials {
    clientId: string;
    clientSecret: string;
    sandbox: boolean;
    baseUrl: string;
}

let cachedToken: { token: string; expiresAt: number; key: string } | null = null;

async function paypalFetch(
    creds: PaypalCredentials,
    path: string,
    method: string,
    body?: unknown,
    accessToken?: string,
): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
    }
    const res = await fetch(creds.baseUrl + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        Logger.error(`PayPal API ${method} ${path} failed: ${JSON.stringify(json).slice(0, 400)}`, loggerCtx);
        throw new UserInputError(`PayPal error: ${(json as any).message || (json as any).error_description || res.status}`);
    }
    return json;
}

/**
 * Thin wrapper around the PayPal REST API (Orders v2), driven by the
 * `paypal-checkout` payment method args (clientId / clientSecret / sandbox).
 */
@Injectable()
export class PaypalService {
    constructor(private paymentMethodService: PaymentMethodService) {}

    async getCredentials(ctx: RequestContext): Promise<PaypalCredentials & { methodCode: string }> {
        const methods = await this.paymentMethodService.findAll(ctx, { filter: { enabled: { eq: true } } });
        const method = methods.items.find(pm => pm.handler.code === 'paypal-checkout');
        if (!method) {
            throw new UserInputError('No enabled PayPal payment method found');
        }
        const arg = (name: string) => method.handler.args.find(a => a.name === name)?.value;
        const clientId = arg('clientId');
        const clientSecret = arg('clientSecret');
        if (!clientId || !clientSecret) {
            throw new UserInputError('PayPal payment method is missing API credentials');
        }
        const sandbox = String(arg('sandbox') ?? 'true') !== 'false';
        return {
            clientId,
            clientSecret,
            sandbox,
            methodCode: method.code,
            baseUrl: sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com',
        };
    }

    private async accessToken(creds: PaypalCredentials): Promise<string> {
        const key = creds.clientId + (creds.sandbox ? ':sb' : ':live');
        if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) {
            return cachedToken.token;
        }
        const params = new URLSearchParams({ grant_type: 'client_credentials' });
        const res = await fetch(creds.baseUrl + '/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64'),
            },
            body: params.toString(),
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok || !json.access_token) {
            throw new UserInputError('PayPal auth failed — check client ID / secret');
        }
        cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 300) * 1000, key };
        return json.access_token;
    }

    /** Creates a PayPal order for the given minor-units amount. Returns the PayPal order id. */
    async createOrder(ctx: RequestContext, amountMinor: number, currencyCode: string, vendureOrderCode: string): Promise<string> {
        const creds = await this.getCredentials(ctx);
        const token = await this.accessToken(creds);
        const value = (amountMinor / 100).toFixed(2);
        const order: any = await paypalFetch(
            creds,
            '/v2/checkout/orders',
            'POST',
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: vendureOrderCode,
                    amount: { currency_code: currencyCode, value },
                    description: `APERT order ${vendureOrderCode}`,
                }],
            },
            token,
        );
        if (!order.id) {
            throw new UserInputError('PayPal could not create the order');
        }
        return order.id;
    }

    /** Captures an approved PayPal order. Returns the capture details. */
    async captureOrder(
        ctx: RequestContext,
        paypalOrderId: string,
    ): Promise<{ captureId: string; status: string; amountMinor: number; currency: string }> {
        const creds = await this.getCredentials(ctx);
        const token = await this.accessToken(creds);
        const result: any = await paypalFetch(creds, `/v2/checkout/orders/${paypalOrderId}/capture`, 'POST', {}, token);
        const unit = result.purchase_units?.[0];
        const capture = unit?.payments?.captures?.[0];
        if (!capture || (capture.status !== 'COMPLETED' && capture.status !== 'PENDING')) {
            throw new UserInputError(`PayPal capture failed (status: ${capture?.status || result.status || 'unknown'})`);
        }
        return {
            captureId: capture.id,
            status: capture.status,
            amountMinor: Math.round(parseFloat(capture.amount.value) * 100),
            currency: capture.amount.currency_code,
        };
    }
}
