# Serverless Real-Time Chat System on AWS

Production-grade portfolio chat system using React, Node.js Lambdas, Cognito, API Gateway WebSocket/HTTP APIs, DynamoDB, SQS Standard Queue, S3, CloudFront, CloudWatch, GitHub Actions, and Terraform.

## Layout

```text
backend/          Plain JavaScript Lambda handlers and tests
frontend/         React app for Cognito auth and realtime chat
infra/bootstrap/  One-time Terraform remote state bootstrap
infra/envs/dev/   Active dev Terraform environment
infra/modules/    Reusable Terraform modules
.github/workflows CI/CD pipeline
```

## First-Time Setup

1. Create the Terraform state backend:

   ```powershell
   cd infra/bootstrap
   terraform init
   terraform apply -var="project_name=serverless-chat" -var="aws_region=ap-southeast-1"
   ```

2. Copy the generated backend values into `infra/envs/dev/backend.tf`.

3. Build the shared Lambda artifact:

   ```powershell
   cd backend
   npm install
   npm run package
   ```

4. Provision dev:

   ```powershell
   cd ../infra/envs/dev
   terraform init
   terraform plan -var-file=dev.tfvars
   terraform apply -var-file=dev.tfvars
   ```

5. Configure frontend environment from Terraform outputs, then build:

   ```powershell
   cd ../../../frontend
   npm install
   npm run build
   ```

## Public Interfaces

REST:

- `GET /conversations`
- `POST /conversations`
- `GET /conversations/{conversationId}/messages?cursor=...`

WebSocket client actions:

- `sendMessage`
- `typing`
- `readReceipt`

Server events:

- `message.created`
- `message.ack`
- `typing.updated`
- `receipt.updated`
- `presence.updated`
- `error`

## Notes

- Only the `dev` environment is active initially.
- SQS is a Standard Queue and is used only for unread counter and conversation summary updates.
- WebSocket `$connect` uses a Lambda authorizer that validates Cognito JWTs.
- Group chat is intentionally minimal: all members have the fixed role `member`.
