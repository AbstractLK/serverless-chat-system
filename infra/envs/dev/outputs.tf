output "rest_api_url" {
  value = module.rest_api.api_endpoint
}

output "websocket_url" {
  value = module.websocket.websocket_url
}

output "cloudfront_domain_name" {
  value = module.frontend.cloudfront_domain_name
}

output "frontend_bucket" {
  value = module.frontend.bucket_name
}

output "cloudfront_distribution_id" {
  value = module.frontend.cloudfront_distribution_id
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.user_pool_client_id
}

output "github_actions_role_arn" {
  value = module.iam_github.role_arn
}
