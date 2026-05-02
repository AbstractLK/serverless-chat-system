provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "dynamodb" {
  source      = "../../modules/dynamodb"
  name_prefix = local.name_prefix
  tags        = local.tags
}

module "sqs" {
  source      = "../../modules/sqs"
  name_prefix = local.name_prefix
  tags        = local.tags
}

module "cognito" {
  source      = "../../modules/cognito"
  name_prefix = local.name_prefix
  tags        = local.tags
}

module "lambda" {
  source                = "../../modules/lambda"
  name_prefix           = local.name_prefix
  environment           = var.environment
  aws_region            = var.aws_region
  lambda_memory_size    = var.lambda_memory_size
  lambda_timeout        = var.lambda_timeout
  max_message_length    = var.max_message_length
  users_table           = module.dynamodb.users_table
  connections_table     = module.dynamodb.connections_table
  conversations_table   = module.dynamodb.conversations_table
  members_table         = module.dynamodb.members_table
  messages_table        = module.dynamodb.messages_table
  chat_events_queue_url = module.sqs.queue_url
  chat_events_queue_arn = module.sqs.queue_arn
  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_client_id     = module.cognito.user_pool_client_id
  lambda_artifact_dir   = "${path.root}/../../../backend/dist"
  tags                  = local.tags
}

module "rest_api" {
  source            = "../../modules/api-http"
  name_prefix       = local.name_prefix
  rest_lambda_arn   = module.lambda.rest_lambda_arn
  rest_lambda_name  = module.lambda.rest_lambda_name
  cognito_issuer    = module.cognito.issuer
  cognito_client_id = module.cognito.user_pool_client_id
  tags              = local.tags
}

module "websocket" {
  source                 = "../../modules/api-websocket"
  name_prefix            = local.name_prefix
  connect_lambda_arn     = module.lambda.connect_lambda_arn
  connect_lambda_name    = module.lambda.connect_lambda_name
  disconnect_lambda_arn  = module.lambda.disconnect_lambda_arn
  disconnect_lambda_name = module.lambda.disconnect_lambda_name
  websocket_lambda_arn   = module.lambda.websocket_lambda_arn
  websocket_lambda_name  = module.lambda.websocket_lambda_name
  authorizer_lambda_arn  = module.lambda.authorizer_lambda_arn
  authorizer_lambda_name = module.lambda.authorizer_lambda_name
  tags                   = local.tags
}

module "frontend" {
  source               = "../../modules/frontend"
  name_prefix          = local.name_prefix
  frontend_domain_name = var.frontend_domain_name
  certificate_arn      = var.certificate_arn
  tags                 = local.tags
}

module "observability" {
  source            = "../../modules/observability"
  name_prefix       = local.name_prefix
  lambda_names      = module.lambda.lambda_names
  sqs_queue_name    = module.sqs.queue_name
  dlq_queue_name    = module.sqs.dlq_name
  messages_table    = module.dynamodb.messages_table
  connections_table = module.dynamodb.connections_table
  aws_region        = var.aws_region
  tags              = local.tags
}

module "iam_github" {
  source            = "../../modules/iam-github"
  name_prefix       = local.name_prefix
  github_repository = var.github_repository
  tags              = local.tags
}
