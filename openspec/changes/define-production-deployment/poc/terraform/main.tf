# JOS-194 proof of concept — SKETCH, NOT YET VALIDATED (no terraform/tofu binary on the authoring machine).
# Written against the Cloudflare provider v5 naming; run `terraform validate` before trusting any attribute.
# Apply order matters: the Access application must exist BEFORE the Worker's custom domain is attached,
# so the hostname is never reachable without the gate (the Worker config also sets workers_dev=false).
terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

variable "account_id" { type = string }
variable "hostname" {
  type    = string
  default = "poc.vid4you.download"
}
variable "allowed_email" {
  type    = string
  default = "jose.elguezabal@gmail.com"
}

# New Zero Trust organisations default to Cloudflare's own identity provider, so one-time PIN is enabled explicitly.
resource "cloudflare_zero_trust_access_identity_provider" "otp" {
  account_id = var.account_id
  name       = "One-time PIN"
  type       = "onetimepin"
  config     = {}
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
  allowed_idps     = [cloudflare_zero_trust_access_identity_provider.otp.id]
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
