terraform {
  backend "s3" {
    bucket         = "serverless-chat-terraform-9f7f8d98-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "serverless-chat-terraform-locks"
    encrypt        = true
  }
}
