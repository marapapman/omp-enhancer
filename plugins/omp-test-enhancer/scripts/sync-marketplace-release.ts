import { syncMarketplaceRelease } from '../src/marketplace/marketplaceRelease.js'

const result = await syncMarketplaceRelease()
console.log(`Updated ${result.catalogPath} to ${result.ref}`)
