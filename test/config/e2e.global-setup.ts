// Reserved for a future shared-container globalSetup.
// Jest globalSetup does not transform TypeScript by default, so e2e uses
// sequential maxWorkers:1 + setupFilesAfterEnv containers instead.
export default async function globalSetup() {}
