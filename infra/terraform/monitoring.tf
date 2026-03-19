# ─────────────────────────────────────────
# CloudWatch — Logs & Alarms
# ─────────────────────────────────────────

# ── Log Groups ──────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/robonet/api"
  retention_in_days = 30

  tags = {
    Name = "robonet-api-logs"
  }
}

resource "aws_cloudwatch_log_group" "voyager" {
  name              = "/robonet/voyager"
  retention_in_days = 14

  tags = {
    Name = "robonet-voyager-logs"
  }
}

# ── SNS Topic for alarm notifications ───

resource "aws_sns_topic" "alerts" {
  name = "robonet-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ── EC2 CPU Alarm (API instance) ─────────

resource "aws_cloudwatch_metric_alarm" "api_cpu_high" {
  alarm_name          = "robonet-api-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Voyager EC2 CPU utilization > 80% for 10 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.voyager.id
  }

  tags = {
    Name = "robonet-api-cpu-alarm"
  }
}

# ── RDS Connection Count Alarm ───────────

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "robonet-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS connection count > 80 for 10 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.id
  }

  tags = {
    Name = "robonet-rds-connections-alarm"
  }
}

# ── API 5xx Error Rate (CloudWatch Logs metric filter) ───

resource "aws_cloudwatch_log_metric_filter" "api_5xx" {
  name           = "robonet-api-5xx"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "[host, ident, authuser, date, request, statusCode=5*, size]"

  metric_transformation {
    name      = "Api5xxCount"
    namespace = "RoboNet/API"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx_alarm" {
  alarm_name          = "robonet-api-5xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Api5xxCount"
  namespace           = "RoboNet/API"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API 5xx errors > 10 in 1 minute"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "robonet-api-5xx-alarm"
  }
}

# ── Redis Eviction Alarm ─────────────────

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "robonet-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  alarm_description   = "Redis evictions > 100 (possible memory pressure)"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.redis.id
  }

  tags = {
    Name = "robonet-redis-evictions-alarm"
  }
}
