variable "name_prefix" { type = string }
variable "tags" { type = map(string) }

resource "aws_dynamodb_table" "users" {
  name         = "${var.name_prefix}-Users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  server_side_encryption { enabled = true }
  tags = var.tags
}

resource "aws_dynamodb_table" "connections" {
  name         = "${var.name_prefix}-Connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "byUser"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption { enabled = true }
  tags = var.tags
}

resource "aws_dynamodb_table" "conversations" {
  name         = "${var.name_prefix}-Conversations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "conversationId"

  attribute {
    name = "conversationId"
    type = "S"
  }

  server_side_encryption { enabled = true }
  tags = var.tags
}

resource "aws_dynamodb_table" "members" {
  name         = "${var.name_prefix}-ConversationMembers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "conversationId"
  range_key    = "userId"

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "byUser"
    hash_key        = "userId"
    range_key       = "conversationId"
    projection_type = "ALL"
  }

  server_side_encryption { enabled = true }
  tags = var.tags
}

resource "aws_dynamodb_table" "messages" {
  name         = "${var.name_prefix}-Messages"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "conversationId"
  range_key    = "messageId"

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "messageId"
    type = "S"
  }

  attribute {
    name = "clientMessageKey"
    type = "S"
  }

  global_secondary_index {
    name            = "byClientMessage"
    hash_key        = "clientMessageKey"
    projection_type = "ALL"
  }

  server_side_encryption { enabled = true }
  tags = var.tags
}

output "users_table" { value = aws_dynamodb_table.users.name }
output "connections_table" { value = aws_dynamodb_table.connections.name }
output "conversations_table" { value = aws_dynamodb_table.conversations.name }
output "members_table" { value = aws_dynamodb_table.members.name }
output "messages_table" { value = aws_dynamodb_table.messages.name }
