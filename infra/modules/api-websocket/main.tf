variable "name_prefix" { type = string }
variable "connect_lambda_arn" { type = string }
variable "connect_lambda_name" { type = string }
variable "disconnect_lambda_arn" { type = string }
variable "disconnect_lambda_name" { type = string }
variable "websocket_lambda_arn" { type = string }
variable "websocket_lambda_name" { type = string }
variable "authorizer_lambda_arn" { type = string }
variable "authorizer_lambda_name" { type = string }
variable "tags" { type = map(string) }

resource "aws_apigatewayv2_api" "this" {
  name                       = "${var.name_prefix}-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  tags                       = var.tags
}

resource "aws_apigatewayv2_authorizer" "connect" {
  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = var.authorizer_lambda_arn
  identity_sources = ["route.request.querystring.token"]
  name             = "${var.name_prefix}-ws-authorizer"
}

resource "aws_apigatewayv2_integration" "connect" {
  api_id           = aws_apigatewayv2_api.this.id
  integration_type = "AWS_PROXY"
  integration_uri  = var.connect_lambda_arn
}

resource "aws_apigatewayv2_integration" "disconnect" {
  api_id           = aws_apigatewayv2_api.this.id
  integration_type = "AWS_PROXY"
  integration_uri  = var.disconnect_lambda_arn
}

resource "aws_apigatewayv2_integration" "websocket" {
  api_id           = aws_apigatewayv2_api.this.id
  integration_type = "AWS_PROXY"
  integration_uri  = var.websocket_lambda_arn
}

resource "aws_apigatewayv2_route" "connect" {
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "$connect"
  target             = "integrations/${aws_apigatewayv2_integration.connect.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.connect.id
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
}

resource "aws_apigatewayv2_route" "message_routes" {
  for_each  = toset(["$default", "sendMessage", "typing", "readReceipt"])
  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.websocket.id}"
}

resource "aws_apigatewayv2_stage" "dev" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "dev"
  auto_deploy = true
  tags        = var.tags
}

resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowWsAuthorizerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_lambda_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/authorizers/*"
}

resource "aws_lambda_permission" "connect" {
  statement_id  = "AllowWsConnectInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.connect_lambda_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/$connect"
}

resource "aws_lambda_permission" "disconnect" {
  statement_id  = "AllowWsDisconnectInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.disconnect_lambda_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/$disconnect"
}

resource "aws_lambda_permission" "websocket" {
  statement_id  = "AllowWsMessageInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.websocket_lambda_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

output "websocket_url" {
  value = "${replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "wss://")}/${aws_apigatewayv2_stage.dev.name}"
}

output "management_endpoint" {
  value = "${aws_apigatewayv2_api.this.api_endpoint}/${aws_apigatewayv2_stage.dev.name}"
}
