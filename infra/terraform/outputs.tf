output "minecraft_public_ip" {
  description = "Public IP address of the Minecraft server EC2 instance"
  value       = aws_instance.minecraft.public_ip
}

output "voyager_private_ip" {
  description = "Private IP address of the Voyager agent EC2 instance"
  value       = aws_instance.voyager.private_ip
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint (host:port)"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
}

output "efs_id" {
  description = "EFS file system ID for Voyager checkpoint storage"
  value       = aws_efs_file_system.ckpt.id
}
