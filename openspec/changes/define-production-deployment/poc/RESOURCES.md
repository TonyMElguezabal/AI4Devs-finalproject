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

### B+ deployed, 2026-10-13 (after Workers Paid was activated)
| Resource | Name / identifier | Cost |
|---|---|---|
| Workers Paid plan | account subscription (activated by the product owner) | $5/month minimum |
| Worker | `vid4you-poc` (assets + `/api` proxy + PoC control routes `/__poc/*`) | within the plan's included requests |
| Durable Object class | `Vid4YouBackend` (SQLite-backed) | within the plan |
| Container application | `vid4you-poc-vid4youbackend`, id `a03a443e-d98f-4524-bc03-4519db83a24e`, `standard-1`, `max_instances` 1 | about $0.90/day while an instance runs |
| Custom domain | `poc-cf.vid4you.download` (Wrangler-managed DNS record) | free |
| Worker secrets | `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | free |
| R2 S3 API token | created by the product owner, scoped to `vid4you-poc-data` | free |

Teardown: `npx wrangler delete --name vid4you-poc` (also removes the container application and the DO), `tofu destroy` in `poc/terraform-bplus`, delete the R2 S3 token and the `vid4you-poc` API token in the dashboard; downgrading Workers Paid is the product owner's call.

## Teardown — 2026-10-13 (task 13.2)

Done after the product owner chose the local packaged application (design Decision 14).

| Step | Result |
|---|---|
| `wrangler delete --name vid4you-poc` | Worker, Durable Object binding and custom domain removed |
| `wrangler containers delete a03a443e-…` | container application removed (it survived the Worker deletion with one live instance) |
| `wrangler containers images delete` × 11 | every pushed tag removed from the Cloudflare registry |
| `aws s3 rm --recursive` (R2 S3 API) | 340 objects removed from `vid4you-poc-data` |
| `tofu destroy` in `poc/terraform-bplus` | 5 destroyed: bucket, Access application, two policies, service token |
| `docker compose down -v` (A stack) and local `poc-r2-*` containers | stopped and removed, `poc_data` volume removed |
| `tofu destroy` in `poc/terraform` | 7 destroyed: tunnel, tunnel configuration, DNS record, Access application, two policies, service token |
| Account check via the API | Access applications: only the pre-existing `VidaaS Admin`; policies: its two; identity providers unchanged; tunnels, R2 buckets, DNS records, service tokens: none of ours; Worker `vid4you-poc` not found |
| Local secrets | scratchpad `cf.env` and `r2.env` deleted; local Terraform state and plan files deleted |

Left for the product owner: delete the `vid4you-poc` API token and the R2 S3 API token in the dashboard, and decide whether to keep Workers Paid. Local Docker images (`vid4you-poc-*`) remain on the developer machine; `docker image rm` frees about 2 GB.
