import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

bootstrapWorker(config).catch(err => {
    // biome-ignore lint: dev log
    console.log(err);
});
