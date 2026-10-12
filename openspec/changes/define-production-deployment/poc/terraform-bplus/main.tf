# JOS-194 proof of concept — option B+ edge pieces (own state, independent of ../terraform). Throwaway.
# The Worker, its Durable Object and the container are deployed by Wrangler (a Containers resource is not confirmed in
# provider v5). Apply this BEFORE `wrangler deploy`: the Access application must exist before the hostname does.
terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

variable "account_id" { type = string }
variable "hostname" {
  type    = string
  default = "poc-cf.vid4you.download"
}
variable "allowed_email" {
  type    = string
  default = "jose.elguezabal@gmail.com"
}
# Reuse the account's existing Google identity provider (see ../terraform/main.tf for the reason).
variable "identity_provider_id" { type = string }

resource "cloudflare_zero_trust_access_service_token" "smoke" {
  account_id = var.account_id
  name       = "vid4you-poc-cf-smoke"
  duration   = "8760h"
}

resource "cloudflare_zero_trust_access_policy" "owner" {
  account_id = var.account_id
  name       = "vid4you-poc-cf owner"
  decision   = "allow"
  include    = [{ email = { email = var.allowed_email } }]
}

resource "cloudflare_zero_trust_access_policy" "smoke" {
  account_id = var.account_id
  name       = "vid4you-poc-cf smoke token"
  decision   = "non_identity"
  include    = [{ service_token = { token_id = cloudflare_zero_trust_access_service_token.smoke.id } }]
}

resource "cloudflare_zero_trust_access_application" "poc" {
  account_id       = var.account_id
  name             = "vid4you-poc-cf"
  domain           = var.hostname
  type             = "self_hosted"
  allowed_idps     = [var.identity_provider_id]
  session_duration = "24h"
  policies = [
    { id = cloudflare_zero_trust_access_policy.owner.id, precedence = 1 },
    { id = cloudflare_zero_trust_access_policy.smoke.id, precedence = 2 },
  ]
}

# One bucket carries both the database replica (litestream/) and the project files (projects/).
resource "cloudflare_r2_bucket" "data" {
  account_id = var.account_id
  name       = "vid4you-poc-data"
}

output "smoke_token_client_id" { value = cloudflare_zero_trust_access_service_token.smoke.client_id }
output "smoke_token_client_secret" {
  value     = cloudflare_zero_trust_access_service_token.smoke.client_secret
  sensitive = true
}
