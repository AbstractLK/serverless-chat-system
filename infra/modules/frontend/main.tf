variable "name_prefix" { type = string }
variable "frontend_domain_name" { type = string }
variable "certificate_arn" { type = string }
variable "tags" { type = map(string) }

resource "random_id" "bucket_suffix" {
  byte_length = 4

  keepers = {
    name_prefix = var.name_prefix
  }
}

resource "aws_s3_bucket" "site" {
  bucket = "${var.name_prefix}-${random_id.bucket_suffix.hex}-frontend"
  tags   = var.tags
}


resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-frontend-oac"
  description                       = "OAC for ${var.name_prefix} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = var.frontend_domain_name == "" ? [] : [var.frontend_domain_name]

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "frontend"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = var.certificate_arn == "" ? null : var.certificate_arn
    cloudfront_default_certificate = var.certificate_arn == ""
    ssl_support_method             = var.certificate_arn == "" ? null : "sni-only"
  }

  tags = var.tags
}

data "aws_iam_policy_document" "bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.bucket.json
}

output "bucket_name" { value = aws_s3_bucket.site.bucket }
output "cloudfront_domain_name" { value = aws_cloudfront_distribution.site.domain_name }
output "cloudfront_distribution_id" { value = aws_cloudfront_distribution.site.id }
