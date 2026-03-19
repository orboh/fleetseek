variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "admin_cidr" {
  description = "Admin IP CIDR for SSH access"
  type        = string
}

variable "db_username" {
  description = "RDS PostgreSQL username"
  type        = string
  default     = "robonet"
  sensitive   = false
}

variable "db_password" {
  description = "RDS PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "minecraft_ami" {
  description = "Ubuntu 22.04 AMI ID for ap-northeast-1"
  type        = string
}

variable "voyager_ami" {
  description = "Ubuntu 22.04 AMI ID for ap-northeast-1"
  type        = string
}

variable "nebius_api_key" {
  description = "Nebius API key for Voyager LLM calls"
  type        = string
  sensitive   = true
}

variable "nebius_base_url" {
  description = "Nebius API base URL (OpenAI-compatible endpoint)"
  type        = string
}

variable "alert_email" {
  description = "Email address to receive CloudWatch alarm notifications (empty = no email subscription)"
  type        = string
  default     = ""
}
