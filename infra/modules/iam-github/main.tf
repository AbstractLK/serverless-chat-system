variable "name_prefix" { type = string }
variable "github_repository" { type = string }
variable "tags" { type = map(string) }

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github" {
  name = "${var.name_prefix}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:*"
        }
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "power_user" {
  role       = aws_iam_role.github.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "terraform_iam_management" {
  name = "${var.name_prefix}-terraform-iam-management"
  role = aws_iam_role.github.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:CreateRole",
          "iam:UpdateRole",
          "iam:DeleteRole",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:GetRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:PassRole"
        ]
        Resource = [
          "arn:aws:iam::*:role/${var.name_prefix}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:GetOpenIDConnectProvider",
          "iam:CreateOpenIDConnectProvider",
          "iam:UpdateOpenIDConnectProviderThumbprint",
          "iam:DeleteOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:UntagOpenIDConnectProvider"
        ]
        Resource = "arn:aws:iam::*:oidc-provider/token.actions.githubusercontent.com"
      },
      {
        Effect = "Allow"
        Action = [
          "iam:GetPolicy",
          "iam:ListPolicies"
        ]
        Resource = "*"
      }
    ]
  })
}

output "role_arn" {
  value = aws_iam_role.github.arn
}
