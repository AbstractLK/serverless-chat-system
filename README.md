<p align="center">
  <img src="https://img.shields.io/badge/AWS-Serverless-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white" alt="AWS Serverless" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Terraform-IaC-7B42BC?style=for-the-badge&logo=terraform&logoColor=white" alt="Terraform" />
  <img src="https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 20" />
  <img src="https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions" />
</p>

# ⚡ Serverless Real-Time Chat System

A **production-grade**, fully serverless chat application built entirely on AWS. Supports real-time 1-on-1 and group messaging, typing indicators, read receipts, user presence, email-based user discovery, and unread counters — all powered by WebSocket APIs, Lambda functions, DynamoDB, and SQS, with infrastructure defined as code using Terraform and automated deployment via GitHub Actions.

---

## 📋 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [WebSocket Protocol](#-websocket-protocol)
- [Infrastructure](#-infrastructure)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Database Schema](#-database-schema)
- [Security](#-security)
- [Observability](#-observability)
- [License](#-license)

---

## 🏗 Architecture Overview

```
┌─────────────┐       HTTPS        ┌────────────────────┐
│   React SPA │ ◄──────────────── │    CloudFront CDN   │
│   (Vite)    │                    │    + S3 Origin      │
└──────┬──────┘                    └────────────────────┘
       │
       │  REST (HTTPS)                    WebSocket (WSS)
       ▼                                       ▼
┌──────────────────┐               ┌───────────────────────┐
│  HTTP API (v2)   │               │  WebSocket API (v2)   │
│  + JWT Authorizer│               │  + Lambda Authorizer  │
└───────┬──────────┘               └──────┬────────────────┘
        │                                 │
        ▼                                 ▼
  ┌───────────┐                ┌─────────────────────┐
  │  REST λ   │                │  Connect / Message / │
  │  Handler  │                │  Disconnect Lambdas  │
  └─────┬─────┘                └──────────┬──────────┘
        │                                 │
        ▼                                 ▼
┌────────────────────────────────────────────────────┐
│                   DynamoDB Tables                   │
│  Users │ Connections │ Conversations │ Members │ Messages │
└────────────────────┬───────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐        ┌────────────────┐
              │  SQS Queue  │───────►│  Worker Lambda │
              │ (Standard)  │        │ (Summaries +   │
              └─────────────┘        │  Unread Counts)│
                     │               └────────────────┘
                     ▼
              ┌─────────────┐
              │  Dead Letter │
              │  Queue (DLQ) │
              └─────────────┘

┌─────────────────────────────────────────────────────┐
│                  Cognito User Pool                   │
│         (Email auth · JWT tokens · User profiles)    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    CloudWatch                        │
│     Dashboard · Lambda Metrics · DLQ Alarm           │
└─────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer              | Technology                                                   |
| ------------------ | ------------------------------------------------------------ |
| **Frontend**       | React 19, Vite, AWS Amplify Auth                             |
| **Backend**        | Node.js 20 (ES Modules), AWS Lambda                          |
| **Authentication** | Amazon Cognito (User Pool + JWT)                             |
| **Database**       | Amazon DynamoDB (PAY_PER_REQUEST, server-side encryption)    |
| **Realtime**       | API Gateway WebSocket API                                    |
| **REST API**       | API Gateway HTTP API (v2) with JWT authorizer                |
| **Async Events**   | Amazon SQS (Standard Queue with DLQ)                         |
| **Hosting**        | Amazon S3 + CloudFront (OAC, HTTPS redirect)                 |
| **IaC**            | Terraform (modular, multi-environment)                       |
| **CI/CD**          | GitHub Actions (OIDC federation, zero stored secrets)         |
| **Observability**  | CloudWatch Dashboard + DLQ Alarm                             |

---

## 📁 Project Structure

```
.
├── backend/                      # Lambda functions (Node.js 20, ES Modules)
│   ├── src/
│   │   ├── config.js             # Environment variable configuration
│   │   ├── handlers/
│   │   │   ├── authorizer.js     # WebSocket JWT authorizer
│   │   │   ├── connect.js        # WebSocket $connect handler
│   │   │   ├── disconnect.js     # WebSocket $disconnect handler
│   │   │   ├── rest.js           # HTTP API route handler
│   │   │   ├── websocket.js      # WebSocket message router
│   │   │   └── worker.js         # SQS consumer (summaries & unread counts)
│   │   └── lib/
│   │       ├── cognito.js        # Cognito user lookup helpers
│   │       ├── db.js             # DynamoDB data access layer
│   │       ├── http.js           # HTTP response/request utilities
│   │       ├── realtime.js       # WebSocket push & SQS publish helpers
│   │       └── validation.js     # Input validation utilities
│   ├── scripts/
│   │   └── package.js            # Zips the Lambda deployment artifact
│   └── test/
│       └── validation.test.js    # Unit tests (Node.js test runner)
│
├── frontend/                     # React SPA (Vite + AWS Amplify Auth)
│   ├── src/
│   │   ├── main.jsx              # Single-file React application
│   │   └── styles.css            # Application styles
│   ├── index.html                # Entry HTML
│   └── vite.config.js            # Vite configuration
│
├── infra/                        # Terraform infrastructure-as-code
│   ├── bootstrap/                # One-time remote state backend setup
│   ├── envs/
│   │   └── dev/                  # Dev environment root module
│   │       ├── main.tf           # Module composition
│   │       ├── variables.tf      # Input variable declarations
│   │       ├── outputs.tf        # Terraform outputs
│   │       ├── versions.tf       # Provider version constraints
│   │       ├── backend.tf        # S3 remote state configuration
│   │       └── dev.tfvars        # Dev variable values
│   └── modules/                  # Reusable Terraform modules
│       ├── api-http/             # HTTP API Gateway + JWT authorizer
│       ├── api-websocket/        # WebSocket API Gateway + Lambda authorizer
│       ├── cognito/              # Cognito User Pool + App Client
│       ├── dynamodb/             # 5 DynamoDB tables
│       ├── frontend/             # S3 + CloudFront distribution
│       ├── iam-github/           # GitHub Actions OIDC role
│       ├── lambda/               # 6 Lambda functions + IAM
│       ├── observability/        # CloudWatch dashboard + alarms
│       └── sqs/                  # SQS queue + dead-letter queue
│
└── .github/
    └── workflows/
        └── dev.yml               # CI/CD pipeline
```

---

## ✨ Features

### Chat
- **Direct messaging** — 1-on-1 conversations between users
- **Group chat** — Multi-user conversations with dynamic member management
- **Real-time messaging** — Instant delivery via WebSocket connections
- **Typing indicators** — Live "user is typing" broadcasts
- **Read receipts** — Track which messages have been seen
- **Unread counters** — Per-conversation unread message counts
- **Message deduplication** — Client-side message IDs prevent duplicates
- **Cursor-based pagination** — Efficiently load message history

### User Management
- **Email-based authentication** — Sign up, confirm, sign in via Cognito
- **User search** — Find users by email address
- **Batch user resolution** — Efficient bulk user profile fetching (up to 25)
- **Avatar generation** — Deterministic color-coded initials avatars

### Infrastructure
- **100% serverless** — No servers to manage, scales to zero
- **Pay-per-request** — DynamoDB on-demand billing, Lambda per-invocation
- **Infrastructure as Code** — Entire stack defined in Terraform
- **Multi-environment support** — Modular Terraform design for dev/staging/prod
- **Automated CI/CD** — Push to `main` triggers validate → deploy

---

## 📦 Prerequisites

| Tool         | Version  | Purpose                      |
| ------------ | -------- | ---------------------------- |
| **Node.js**  | ≥ 20     | Backend & frontend builds    |
| **npm**      | ≥ 10     | Package management           |
| **Terraform**| ≥ 1.5    | Infrastructure provisioning  |
| **AWS CLI**  | ≥ 2      | AWS credential management    |

You also need an AWS account with appropriate permissions and configured credentials.

---

## 🚀 Getting Started

### 1. Bootstrap Terraform Remote State

> **One-time setup.** Creates the S3 bucket and DynamoDB table for Terraform state.

```powershell
cd infra/bootstrap
terraform init
terraform apply -var="project_name=serverless-chat" -var="aws_region=ap-southeast-1"
```

Copy the generated backend values into `infra/envs/dev/backend.tf`.

### 2. Build the Backend Lambda Artifact

```powershell
cd backend
npm install
npm run package     # → backend/dist/app.zip
```

### 3. Provision the Dev Environment

```powershell
cd infra/envs/dev
terraform init
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

### 4. Configure and Build the Frontend

Create `frontend/.env.local` from Terraform outputs:

```env
VITE_AWS_REGION=ap-southeast-1
VITE_REST_API_URL=<rest_api_url output>
VITE_WEBSOCKET_URL=<websocket_url output>
VITE_COGNITO_USER_POOL_ID=<cognito_user_pool_id output>
VITE_COGNITO_CLIENT_ID=<cognito_client_id output>
```

Then build:

```powershell
cd frontend
npm install
npm run build       # → frontend/dist/
```

### 5. Deploy the Frontend

```powershell
aws s3 sync frontend/dist s3://<frontend_bucket output> --delete
aws cloudfront create-invalidation --distribution-id <cloudfront_distribution_id output> --paths "/*"
```

### 6. Run Locally (Development)

```powershell
cd frontend
npm run dev         # → http://localhost:5173
```

---

## 🔑 Environment Variables

### Backend (Lambda — set via Terraform)

| Variable                | Description                                |
| ----------------------- | ------------------------------------------ |
| `ENVIRONMENT`           | Deployment environment (`dev`, `prod`)     |
| `USERS_TABLE`           | DynamoDB Users table name                  |
| `CONNECTIONS_TABLE`     | DynamoDB Connections table name             |
| `CONVERSATIONS_TABLE`   | DynamoDB Conversations table name           |
| `MEMBERS_TABLE`         | DynamoDB ConversationMembers table name     |
| `MESSAGES_TABLE`        | DynamoDB Messages table name                |
| `CHAT_EVENTS_QUEUE_URL` | SQS queue URL for async event processing   |
| `WEBSOCKET_ENDPOINT`    | WebSocket API management endpoint          |
| `COGNITO_USER_POOL_ID`  | Cognito User Pool ID                       |
| `COGNITO_CLIENT_ID`     | Cognito App Client ID                      |
| `MAX_MESSAGE_LENGTH`    | Maximum message length (default: `2000`)   |

### Frontend (Vite — build-time)

| Variable                       | Description                   |
| ------------------------------ | ----------------------------- |
| `VITE_AWS_REGION`              | AWS region                    |
| `VITE_REST_API_URL`            | HTTP API endpoint URL         |
| `VITE_WEBSOCKET_URL`           | WebSocket API endpoint URL    |
| `VITE_COGNITO_USER_POOL_ID`    | Cognito User Pool ID          |
| `VITE_COGNITO_CLIENT_ID`       | Cognito App Client ID         |

---

## 📡 API Reference

### REST API (HTTP API Gateway)

All endpoints require a valid Cognito JWT in the `Authorization: Bearer <token>` header.

#### Conversations

| Method | Endpoint                                       | Description                     |
| ------ | ---------------------------------------------- | ------------------------------- |
| `GET`  | `/conversations`                               | List authenticated user's conversations |
| `POST` | `/conversations`                               | Create a new conversation       |
| `GET`  | `/conversations/{conversationId}/messages`     | Paginated message history       |

**Create Conversation Body:**
```json
{
  "type": "direct",
  "memberIds": ["<target-user-id>"]
}
```

```json
{
  "type": "group",
  "memberIds": ["<user-id-1>", "<user-id-2>"]
}
```

**Message Pagination:**
```
GET /conversations/{id}/messages?cursor=<base64url-encoded-cursor>
```

#### Users

| Method | Endpoint              | Description                                  |
| ------ | --------------------- | -------------------------------------------- |
| `GET`  | `/users/search?email=`| Search for a user by email address           |
| `GET`  | `/users/{userId}`     | Get a single user's profile                  |
| `POST` | `/users/batch`        | Batch resolve up to 25 user profiles         |

**Batch Users Body:**
```json
{
  "userIds": ["<user-id-1>", "<user-id-2>"]
}
```

---

## 🔌 WebSocket Protocol

### Connection

```
wss://<websocket-url>?token=<cognito-id-token>
```

The `$connect` route uses a **Lambda authorizer** that validates the Cognito JWT from the `token` query parameter.

### Client → Server Actions

| Action        | Payload                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `sendMessage` | `{ "action": "sendMessage", "conversationId": "...", "clientMessageId": "...", "text": "..." }` |
| `typing`      | `{ "action": "typing", "conversationId": "...", "isTyping": true }`     |
| `readReceipt` | `{ "action": "readReceipt", "conversationId": "...", "messageId": "..." }` |

### Server → Client Events

| Event Type        | Description                                      |
| ----------------- | ------------------------------------------------ |
| `message.created` | A new message was sent in a conversation         |
| `message.ack`     | Server acknowledgement of a sent message         |
| `typing.updated`  | A user started or stopped typing                 |
| `receipt.updated` | A user read a message                            |
| `presence.updated`| A user connected or disconnected                 |
| `error`           | An error occurred processing the client action   |

---

## 🏢 Infrastructure

### Terraform Modules

The infrastructure is organized into **9 reusable Terraform modules**:

| Module            | Resources                                               |
| ----------------- | ------------------------------------------------------- |
| `api-http`        | HTTP API Gateway, JWT authorizer, Lambda integration    |
| `api-websocket`   | WebSocket API Gateway, Lambda authorizer, 4 routes      |
| `cognito`         | User Pool (email auth), App Client (SRP + password)     |
| `dynamodb`        | 5 tables (Users, Connections, Conversations, Members, Messages) |
| `frontend`        | S3 bucket, CloudFront distribution, OAC, bucket policy  |
| `iam-github`      | OIDC provider, GitHub Actions IAM role                  |
| `lambda`          | 6 Lambda functions, shared IAM role, SQS event mapping  |
| `observability`   | CloudWatch dashboard, DLQ alarm                         |
| `sqs`             | Standard queue (chat events), Dead-letter queue          |

### Key Design Decisions

- **PAY_PER_REQUEST billing** on all DynamoDB tables — no capacity planning needed
- **Server-side encryption** enabled on all tables
- **TTL on Connections table** — stale WebSocket connections auto-expire after 24 hours
- **Single Lambda artifact** — all handlers share one deployment package for simplicity
- **SQS Standard Queue** — used only for eventually-consistent operations (unread counts, conversation summaries)
- **DLQ with alarm** — failed events surface immediately via CloudWatch alarm

---

## 🔄 CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/dev.yml`) runs two jobs:

### `validate` (on every push & PR)

1. **Backend** — `npm ci` → lint → test → audit → package
2. **Frontend** — `npm ci` → lint → build
3. **Terraform** — fmt check → init → validate → plan

### `deploy-dev` (on push to `main` only)

1. Assume AWS role via **OIDC federation** (no stored AWS keys)
2. Build backend artifact → `terraform apply -auto-approve`
3. Export Terraform outputs → build frontend with injected env vars
4. `aws s3 sync` frontend to S3 → invalidate CloudFront cache

```
PR / push ──► validate ──► ✅ pass
                              │
main push ──► validate ──► deploy-dev ──► 🚀 live
```

### Required GitHub Secrets

| Secret                          | Description                               |
| ------------------------------- | ----------------------------------------- |
| `AWS_GITHUB_ACTIONS_ROLE_ARN`   | IAM role ARN for OIDC-based AWS access    |

---

## 🗄 Database Schema

### DynamoDB Tables

#### `Users`
| Key        | Type | Description     |
| ---------- | ---- | --------------- |
| `userId` (PK) | `S` | Cognito sub ID |

#### `Connections`
| Key              | Type | Description                   |
| ---------------- | ---- | ----------------------------- |
| `connectionId` (PK) | `S` | API Gateway connection ID  |
| `userId` (GSI: `byUser`) | `S` | Owning user ID       |
| `ttl`            | `N`  | Auto-expiry (24 hours)        |

#### `Conversations`
| Key                 | Type | Description                    |
| ------------------- | ---- | ------------------------------ |
| `conversationId` (PK) | `S` | UUID                        |
| `type`              | `S`  | `direct` or `group`            |
| `memberIds`         | `L`  | List of user IDs               |
| `latestMessageId`   | `S`  | Most recent message ID         |

#### `ConversationMembers`
| Key                 | Type | Description                    |
| ------------------- | ---- | ------------------------------ |
| `conversationId` (PK) | `S` | Conversation UUID           |
| `userId` (SK)       | `S`  | Member user ID                 |
| `role`              | `S`  | Always `member`                |
| `unreadCount`       | `N`  | Unread message count           |
| GSI: `byUser`       | —    | `userId` → `conversationId`    |

#### `Messages`
| Key                    | Type | Description                 |
| ---------------------- | ---- | --------------------------- |
| `conversationId` (PK)  | `S`  | Conversation UUID           |
| `messageId` (SK)       | `S`  | Message UUID                |
| `senderId`             | `S`  | Sender user ID              |
| `text`                 | `S`  | Message content             |
| `clientMessageKey`     | `S`  | Deduplication key           |
| GSI: `byClientMessage` | —   | `clientMessageKey` lookup   |

---

## 🔒 Security

| Concern                    | Implementation                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| **Authentication**         | Cognito User Pool with email verification + SRP auth               |
| **REST Authorization**     | API Gateway JWT authorizer validates Cognito ID tokens              |
| **WebSocket Authorization**| Custom Lambda authorizer validates JWTs on `$connect`               |
| **Data Encryption**        | DynamoDB server-side encryption enabled; SQS KMS encryption         |
| **Frontend Delivery**      | HTTPS-only via CloudFront with redirect; S3 fully private (OAC)    |
| **Conversation Access**    | All message and typing operations enforce membership checks         |
| **CI/CD Credentials**      | GitHub Actions OIDC federation — no long-lived AWS keys stored      |
| **Input Validation**       | Message length limits (configurable, default 2000 chars)            |
| **Password Policy**        | Min 8 chars, requires uppercase, lowercase, and numbers             |

---

## 📊 Observability

### CloudWatch Dashboard

A pre-provisioned dashboard (`{name_prefix}-chat`) displays:

- **Lambda error metrics** — per-function error rates for all 6 Lambdas
- **SQS health** — oldest message age + DLQ visible message count

### Alarms

| Alarm                  | Trigger                                    | Purpose                          |
| ---------------------- | ------------------------------------------ | -------------------------------- |
| `{prefix}-dlq-visible` | DLQ messages > 0 for 1 evaluation period  | Alert on failed event processing |

---

## 📝 Notes

- Only the **dev** environment is active by default. To add staging/prod, duplicate `infra/envs/dev/` and adjust `tfvars`.
- SQS is a **Standard Queue** used only for unread counter and conversation summary updates (eventually consistent by design).
- WebSocket `$connect` uses a **Lambda authorizer** that validates Cognito JWTs passed via the `token` query parameter.
- Group chat is intentionally minimal — all members have the fixed role `member`.
- The frontend is a **single-file React application** (`main.jsx`) for simplicity.

You can destroy all resources by running terraform destroy from the dev environment directory:

```
cd infra/envs/dev
terraform destroy -var-file=dev.tfvars
```

Terraform remote state backend (S3 bucket + DynamoDB lock table)
If you want to destroy that too, run:

```
cd infra/bootstrap
terraform destroy -var="project_name=serverless-chat" -var="aws_region=ap-southeast-1"
```

---

## 📄 License

This project is part of a portfolio demonstration. See the repository for license details.

---

<p align="center">
  Built with ☁️ on AWS &nbsp;·&nbsp; Infrastructure as Code with Terraform &nbsp;·&nbsp; CI/CD with GitHub Actions
</p>
