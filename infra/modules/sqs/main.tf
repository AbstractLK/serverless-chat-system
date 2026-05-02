variable "name_prefix" { type = string }
variable "tags" { type = map(string) }

resource "aws_sqs_queue" "dlq" {
  name              = "${var.name_prefix}-ChatEventsDLQ"
  kms_master_key_id = "alias/aws/sqs"
  tags              = var.tags
}

resource "aws_sqs_queue" "queue" {
  name              = "${var.name_prefix}-ChatEventsQueue"
  kms_master_key_id = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })

  tags = var.tags
}

output "queue_url" { value = aws_sqs_queue.queue.url }
output "queue_arn" { value = aws_sqs_queue.queue.arn }
output "queue_name" { value = aws_sqs_queue.queue.name }
output "dlq_name" { value = aws_sqs_queue.dlq.name }
