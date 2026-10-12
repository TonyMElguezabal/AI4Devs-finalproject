# JOS-194 proof of concept — option A edge (design § Execution Record §5.4, module "edge"). Throwaway.
# Creates only NEW resources; the account's existing Access app, policies and identity providers are not managed here.
# Apply order: the Access application must exist BEFORE the DNS record, so the hostname is never reachable ungated.
terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

variable "account_id" { type = string }
variable "zone_id" { type = string }
variable "hostname" {
  type    = string
  default = "poc.vid4you.download"
}
variable "allowed_email" {
  type    = string
  default = "jose.elguezabal@gmail.com"
}
# The account already has a Google identity provider; reusing it avoids adding a one-time-PIN provider,
# which would also appear on the login page of the account's other Access application.
variable "identity_provider_id" { type = string }

resource "cloudflare_zero_trust_tunnel_cloudflared" "poc" {
  account_id = var.account_id
  name       = "vid4you-poc"
  config_src = "cloudflare"
}

# Caddy listens on 8080 in the namespace cloudflared shares (poc/compose.yml).
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "poc" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.poc.id
  config = {
    ingress = [
      { hostname = var.hostname, service = "http://127.0.0.1:8080" },
      { service = "http_status:404" },
    ]
  }
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "poc" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.poc.id
}

resource "cloudflare_zero_trust_access_service_token" "smoke" {
  account_id = var.account_id
  name       = "vid4you-poc-smoke"
  duration   = "8760h"
}

resource "cloudflare_zero_trust_access_policy" "owner" {
  account_id = var.account_id
  name       = "vid4you-poc owner"
  decision   = "allow"
  include    = [{ email = { email = var.allowed_email } }]
}

resource "cloudflare_zero_trust_access_policy" "smoke" {
  account_id = var.account_id
  name       = "vid4you-poc smoke token"
  decision   = "non_identity"
  include    = [{ service_token = { token_id = cloudflare_zero_trust_access_service_token.smoke.id } }]
}

resource "cloudflare_zero_trust_access_application" "poc" {
  account_id       = var.account_id
  name             = "vid4you-poc"
  domain           = var.hostname
  type             = "self_hosted"
  allowed_idps     = [var.identity_provider_id]
  session_duration = "24h"
  policies = [
    { id = cloudflare_zero_trust_access_policy.owner.id, precedence = 1 },
    { id = cloudflare_zero_trust_access_policy.smoke.id, precedence = 2 },
  ]
}

resource "cloudflare_dns_record" "poc" {
  zone_id    = var.zone_id
  name       = var.hostname
  type       = "CNAME"
  content    = "${cloudflare_zero_trust_tunnel_cloudflared.poc.id}.cfargotunnel.com"
  proxied    = true
  ttl        = 1
  depends_on = [cloudflare_zero_trust_access_application.poc]
}

output "tunnel_token" {
  value     = data.cloudflare_zero_trust_tunnel_cloudflared_token.poc.token
  sensitive = true
}
output "smoke_token_client_id" { value = cloudflare_zero_trust_access_service_token.smoke.client_id }
output "smoke_token_client_secret" {
  value     = cloudflare_zero_trust_access_service_token.smoke.client_secret
  sensitive = true
}
