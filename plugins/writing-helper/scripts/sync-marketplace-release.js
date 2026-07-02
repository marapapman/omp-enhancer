import { syncMarketplaceRelease } from '../src/marketplace-release.js';

const result = await syncMarketplaceRelease();
console.log(`Updated .omp-plugin/marketplace.json to ${result.ref}`);
