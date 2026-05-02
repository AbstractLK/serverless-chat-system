terraform {
  backend "s3" {
    bucket         = "serverless-chat-terraform-d1417c5c-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "serverless-chat-terraform-locks"
    encrypt        = true
  }
}
