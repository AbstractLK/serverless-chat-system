terraform {
  backend "s3" {
    bucket         = "serverless-chat-terraform-5afbd7f6-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "serverless-chat-terraform-locks"
    encrypt        = true
  }
}
