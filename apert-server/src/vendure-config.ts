import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    LanguageCode,
    VendureConfig,
} from '@vendure/core';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import 'dotenv/config';
import path from 'path';

const IS_DEV = process.env.APP_ENV === 'dev';
// PORT wins because hosting platforms inject it into the environment at runtime.
const serverPort = +process.env.PORT! || +process.env.VENDURE_SERVER_PORT! || 3000;

export const config: VendureConfig = {
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        cors: {
            origin: IS_DEV ? true : [],
            credentials: true,
        },
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME!,
            password: process.env.SUPERADMIN_PASSWORD!,
        },
        cookieOptions: {
            secret: process.env.COOKIE_SECRET!,
        },
    },
    dbConnectionOptions: process.env.DATABASE_URL
        ? {
              // Production (e.g. Neon Postgres on Render). SSL required.
              type: 'postgres',
              url: process.env.DATABASE_URL,
              synchronize: true, // demo convenience — use migrations for real production
              logging: false,
              ssl: { rejectUnauthorized: false },
          }
        : {
              // Local dev: file-based SQLite, zero setup.
              // NOTE: `synchronize: true` auto-updates the schema on start.
              // Fine for local dev — use migrations for production.
              type: 'better-sqlite3',
              synchronize: true,
              logging: false,
              database: path.join(__dirname, '../vendure.sqlite'),
          } as any,
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    customFields: {
        ProductVariant: [
            { name: 'listPrice', type: 'int', defaultValue: 899, label: [{ languageCode: LanguageCode.en, value: 'Compare-at price (minor units)' }] },
        ],
    },
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // In production set PUBLIC_URL to e.g. https://apert.onrender.com
            // so asset URLs are absolute and correct behind the proxy.
            assetUrlPrefix: IS_DEV ? undefined : process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/assets/` : undefined,
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    ],
};
