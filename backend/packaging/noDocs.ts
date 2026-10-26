// package-executables-build (JOS-205) Decision 6 — stands in for `@fastify/swagger-ui` in the packaged bundle, which serves
// files from node_modules at runtime and so cannot work inside a single executable. `/docs` therefore answers 404.
export default async function noDocs(): Promise<void> {}
