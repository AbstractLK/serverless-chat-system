variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "lambda_memory_size" { type = number }
variable "lambda_timeout" { type = number }
variable "max_message_length" { type = number }
variable "users_table" { type = string }
variable "connections_table" { type = string }
variable "conversations_table" { type = string }
variable "members_table" { type = string }
variable "messages_table" { type = string }
variable "chat_events_queue_url" { type = string }
variable "chat_events_queue_arn" { type = string }
variable "cognito_user_pool_id" { type = string }
variable "cognito_client_id" { type = string }
variable "lambda_artifact_dir" { type = string }
variable "tags" { type = map(string) }

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "lambda" {
  name = "${var.name_prefix}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "app" {
  name = "${var.name_prefix}-lambda-app"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:TransactWriteItems"]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.users_table}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.connections_table}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.connections_table}/index/*",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.conversations_table}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.members_table}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.members_table}/index/*",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.messages_table}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.messages_table}/index/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = var.chat_events_queue_arn
      },
      {
        Effect   = "Allow"
        Action   = "execute-api:ManageConnections"
        Resource = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/*/POST/@connections/*"
      },
      {
        Effect   = "Allow"
        Action   = ["cognito-idp:ListUsers", "cognito-idp:AdminGetUser"]
        Resource = "arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${var.cognito_user_pool_id}"
      }
    ]
  })
}

locals {
  handlers = {
    authorizer = "src/handlers/authorizer.handler"
    connect    = "src/handlers/connect.handler"
    disconnect = "src/handlers/disconnect.handler"
    rest       = "src/handlers/rest.handler"
    websocket  = "src/handlers/websocket.handler"
    worker     = "src/handlers/worker.handler"
  }

  common_env = {
    ENVIRONMENT           = var.environment
    USERS_TABLE           = var.users_table
    CONNECTIONS_TABLE     = var.connections_table
    CONVERSATIONS_TABLE   = var.conversations_table
    MEMBERS_TABLE         = var.members_table
    MESSAGES_TABLE        = var.messages_table
    CHAT_EVENTS_QUEUE_URL = var.chat_events_queue_url
    COGNITO_USER_POOL_ID  = var.cognito_user_pool_id
    COGNITO_CLIENT_ID     = var.cognito_client_id
    MAX_MESSAGE_LENGTH    = tostring(var.max_message_length)
  }
}

resource "aws_lambda_function" "this" {
  for_each = local.handlers

  function_name    = "${var.name_prefix}-${each.key}"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = each.value
  filename         = "${var.lambda_artifact_dir}/app.zip"
  source_code_hash = filebase64sha256("${var.lambda_artifact_dir}/app.zip")
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout

  environment {
    variables = local.common_env
  }

  tags = var.tags
}

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn = var.chat_events_queue_arn
  function_name    = aws_lambda_function.this["worker"].arn
  batch_size       = 10
}

output "authorizer_lambda_arn" { value = aws_lambda_function.this["authorizer"].invoke_arn }
output "authorizer_lambda_name" { value = aws_lambda_function.this["authorizer"].function_name }
output "connect_lambda_arn" { value = aws_lambda_function.this["connect"].invoke_arn }
output "connect_lambda_name" { value = aws_lambda_function.this["connect"].function_name }
output "disconnect_lambda_arn" { value = aws_lambda_function.this["disconnect"].invoke_arn }
output "disconnect_lambda_name" { value = aws_lambda_function.this["disconnect"].function_name }
output "rest_lambda_arn" { value = aws_lambda_function.this["rest"].invoke_arn }
output "rest_lambda_name" { value = aws_lambda_function.this["rest"].function_name }
output "websocket_lambda_arn" { value = aws_lambda_function.this["websocket"].invoke_arn }
output "websocket_lambda_name" { value = aws_lambda_function.this["websocket"].function_name }
output "lambda_names" { value = [for fn in aws_lambda_function.this : fn.function_name] }
