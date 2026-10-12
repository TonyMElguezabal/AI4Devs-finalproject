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
