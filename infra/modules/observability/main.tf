variable "name_prefix" { type = string }
variable "lambda_names" { type = list(string) }
variable "sqs_queue_name" { type = string }
variable "dlq_queue_name" { type = string }
variable "messages_table" { type = string }
variable "connections_table" { type = string }
variable "aws_region" { type = string }
variable "tags" { type = map(string) }

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = "${var.name_prefix}-chat"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          metrics = [for name in var.lambda_names : ["AWS/Lambda", "Errors", "FunctionName", name]]
          region  = var.aws_region
          title   = "Lambda errors"
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.sqs_queue_name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.dlq_queue_name]
          ]
          region = var.aws_region
          title  = "SQS health"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${var.name_prefix}-dlq-visible"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "DLQ contains messages"
  dimensions = {
    QueueName = var.dlq_queue_name
  }
  tags = var.tags
}
