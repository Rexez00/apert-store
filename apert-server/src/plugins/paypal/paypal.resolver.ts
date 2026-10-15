// @ts-ignore TS1479: @nestjs/* ship ESM-only types, but Node 22+ handles require(esm) at runtime
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
    ActiveOrderService,
    Allow,
    Ctx,
    EntityHydrator,
    Order,
    OrderService,
    Permission,
    RequestContext,
    UserInputError,
} from '@vendure/core';
import { PaypalService } from './paypal.service';

function asOrder(value: unknown, op: string): Order {
    const v: any = value;
    if (!v || v.__typename !== 'Order') {
        throw new UserInputError(`${op} failed: ${v?.errorCode || 'unknown'} ${v?.message || v?.transitionError || ''}`.trim());
    }
    return v as Order;
}

@Resolver()
export class PaypalShopResolver {
    constructor(
        private paypalService: PaypalService,
        private activeOrderService: ActiveOrderService,
        private orderService: OrderService,
        private entityHydrator: EntityHydrator,
    ) {}

    private async getActiveOrderOrFail(ctx: RequestContext): Promise<Order> {
        const order = await this.activeOrderService.getActiveOrder(ctx, undefined);
        if (!order) {
            throw new UserInputError('Your bag is empty.');
        }
        await this.entityHydrator.hydrate(ctx, order, { relations: ['lines'] });
        if (order.lines.length === 0) {
            throw new UserInputError('Your bag is empty.');
        }
        return order;
    }

    /**
     * Creates a PayPal order for the shopper's active order.
     * The storefront passes the returned id to the PayPal Buttons SDK.
     */
    @Mutation()
    @Allow(Permission.Owner)
    async createPaypalOrder(@Ctx() ctx: RequestContext): Promise<string> {
        const order = await this.getActiveOrderOrFail(ctx);
        return this.paypalService.createOrder(ctx, order.totalWithTax, order.currencyCode, order.code);
    }

    /**
     * Captures an approved PayPal order and records it on the Vendure order.
     * Returns the settled order (with its confirmation code).
     */
    @Mutation()
    @Allow(Permission.Owner)
    async capturePaypalOrder(@Ctx() ctx: RequestContext, @Args() args: { paypalOrderId: string }): Promise<Order> {
        const order = await this.getActiveOrderOrFail(ctx);
        const capture = await this.paypalService.captureOrder(ctx, args.paypalOrderId);
        if (order.state !== 'ArrangingPayment' && order.state !== 'ArrangingAdditionalPayment') {
            asOrder(await this.orderService.transitionToState(ctx, order.id, 'ArrangingPayment'), 'prepare payment');
        }
        const creds = await this.paypalService.getCredentials(ctx);
        const withPayment: any = await this.orderService.addPaymentToOrder(ctx, order.id, {
            method: creds.methodCode,
            metadata: {
                paypalOrderId: args.paypalOrderId,
                captureId: capture.captureId,
                captureStatus: capture.status,
            },
        });
        asOrder(withPayment, 'record payment');
        const settled: any = await this.orderService.transitionToState(ctx, order.id, 'PaymentSettled');
        return asOrder(settled, 'settle order');
    }
}
