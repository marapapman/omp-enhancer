import { syncMarketplaceRelease } from '../src/marketplace-release.js';

const result = await syncMarketplaceRelease();
console.log(`Updated ${result.catalogPath} to ${result.ref}`);
