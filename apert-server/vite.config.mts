import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/dashboard',
    build: {
        outDir: join(__dirname, 'dist/dashboard'),
    },
    plugins: [
        vendureDashboardPlugin({
            vendureConfigPath: pathToFileURL('./src/vendure-config.ts'),
            api: { host: 'http://localhost', port: 3002 },
        }),
    ],
});
