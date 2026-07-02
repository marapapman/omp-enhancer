import { syncMarketplaceRelease } from '../src/marketplace/marketplaceRelease.js'

const result = await syncMarketplaceRelease()
console.log(`Updated .omp-plugin/marketplace.json to ${result.ref}`)
