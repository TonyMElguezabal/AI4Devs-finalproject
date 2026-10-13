# JOS-194 proof of concept — created resources (task 6.4)

Created 2026-10-12 with `tofu apply` from `poc/terraform/` (OpenTofu 1.13.1, Cloudflare provider v5) into account `13c5e2382a1ac80bcac04746ad8e04da`, zone `vid4you.download`. Teardown (task 13.2): `tofu destroy` in the same directory, `docker compose -f compose.yml --profile tunnel down -v`, then delete the API token used to apply.

| Resource | Name / identifier | Cost |
|---|---|---|
| Tunnel | `vid4you-poc` (`cloudflare_zero_trust_tunnel_cloudflared`) | free |
| Tunnel configuration | ingress `poc.vid4you.download` → `http://127.0.0.1:8080`, fallback 404 | free |
| DNS record | `poc.vid4you.download` CNAME → `<tunnel id>.cfargotunnel.com`, proxied | free |
| Access application | `vid4you-poc`, self-hosted, domain `poc.vid4you.download`, identity provider: the account's existing Google provider | free (Zero Trust free plan, ≤ 50 users) |
| Access policy | `vid4you-poc owner`, allow, email `jose.elguezabal@gmail.com` | free |
| Access policy | `vid4you-poc smoke token`, non-identity, the smoke service token | free |
| Access service token | `vid4you-poc-smoke`, 8760 h | free |

Not created: R2 buckets, Workers, Containers (skipped by decision), a one-time-PIN identity provider, any VM. The account's existing resources (`VidaaS Admin` application, its policies, the Google provider) were not modified.

Local host stand-in: docker compose project `poc` on the developer machine (containers `backend`, `caddy`, `cloudflared`, named volume `poc_data`), no ports published. That machine stands in for the VM.

## B+ proof of concept (created 2026-10-13 from `poc/terraform-bplus/`, separate state)

| Resource | Name / identifier | Cost |
|---|---|---|
| R2 bucket | `vid4you-poc-data` (database replica under `litestream/`, media under `projects/`) | free tier 10 GB, then cents |
| Access application | `vid4you-poc-cf`, domain `poc-cf.vid4you.download`, identity provider: the existing Google provider | free |
| Access policies | `vid4you-poc-cf owner` (allow, product owner's email), `vid4you-poc-cf smoke token` (non-identity) | free |
| Access service token | `vid4you-poc-cf-smoke`, 8760 h | free |

Not yet created (waiting for the R2 test, task 6.15): the Worker `vid4you-poc`, its Durable Object, the container instance (`standard-1`), the custom domain record, Workers Paid plan. Teardown: `tofu destroy` in `poc/terraform-bplus`, `wrangler delete` for the Worker, then delete the R2 S3 token.

### B+ deploy attempt, 2026-10-13 (stopped by the plan)
`wrangler deploy` uploaded the Worker script `vid4you-poc` (assets and Durable Object binding, no container application, no custom-domain record) and then failed at the Containers API: "You do not have access to Cloudflare Containers. Deploying containers requires the Workers Paid plan." The account is on the Workers Free plan. Nothing billable was created. Remove the script with `npx wrangler delete --name vid4you-poc` if B+ is abandoned.
