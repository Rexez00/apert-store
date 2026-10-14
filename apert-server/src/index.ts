import { bootstrap, runMigrations } from '@vendure/core';
import { config } from './vendure-config';
import express from 'express';
import path from 'path';

// The APERT storefront (index.html, checkout.html, images). Locally this is the
// workspace root; in Docker it is $STOREFRONT_DIR. Served same-origin so the
// shop has no CORS or cookie issues.
const storefrontDir = process.env.STOREFRONT_DIR || path.join(__dirname, '..', '..');

runMigrations(config)
    .then(() =>
        bootstrap(config, {
            onBeforeAppListen: async app => {
                app.use(express.static(storefrontDir));
                // biome-ignore lint: dev log
                console.log(`[store] storefront served from ${storefrontDir}`);
            },
        }),
    )
    .catch(err => {
        // biome-ignore lint: dev log
        console.log(err);
    });
