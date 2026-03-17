terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ─────────────────────────────────────────
# VPC
# ─────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "robonet-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "robonet-igw"
  }
}

# ─────────────────────────────────────────
# Subnets
# ─────────────────────────────────────────

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-northeast-1a"
  map_public_ip_on_launch = true

  tags = {
    Name = "robonet-public-subnet"
  }
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "ap-northeast-1a"

  tags = {
    Name = "robonet-private-subnet"
  }
}

resource "aws_subnet" "private_c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "ap-northeast-1c"

  tags = {
    Name = "robonet-private-subnet-c"
  }
}

resource "aws_route_table_association" "private_c" {
  subnet_id      = aws_subnet.private_c.id
  route_table_id = aws_route_table.private.id
}

# ─────────────────────────────────────────
# Routing
# ─────────────────────────────────────────

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "robonet-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "robonet-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id

  tags = {
    Name = "robonet-nat-gw"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "robonet-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

# ─────────────────────────────────────────
# Security Groups
# ─────────────────────────────────────────

resource "aws_security_group" "minecraft" {
  name        = "robonet-minecraft-sg"
  description = "Security group for Minecraft server"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Minecraft from Voyager"
    from_port       = 25565
    to_port         = 25565
    protocol        = "tcp"
    security_groups = [aws_security_group.voyager.id]
  }

  ingress {
    description     = "RCON from Voyager"
    from_port       = 25575
    to_port         = 25575
    protocol        = "tcp"
    security_groups = [aws_security_group.voyager.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-minecraft"
  }
}

resource "aws_security_group" "voyager" {
  name        = "robonet-voyager-sg"
  description = "Security group for Voyager agent EC2"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH from admin"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-voyager"
  }
}

resource "aws_security_group" "alb" {
  name        = "robonet-alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-alb"
  }
}

resource "aws_security_group" "api" {
  name        = "robonet-api-sg"
  description = "Security group for RoboNet API"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "API from Voyager"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.voyager.id]
  }

  ingress {
    description     = "API from ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-api"
  }
}

resource "aws_security_group" "rds" {
  name        = "robonet-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from API"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-rds"
  }
}

resource "aws_security_group" "redis" {
  name        = "robonet-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from API"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-redis"
  }
}

# ─────────────────────────────────────────
# RDS PostgreSQL 15
# ─────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "robonet-db-subnet-group"
  subnet_ids = [aws_subnet.private.id, aws_subnet.private_c.id]

  tags = {
    Name = "robonet-db-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "robonet-postgres"
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = "db.t3.medium"
  allocated_storage      = 20
  storage_type           = "gp2"
  db_name                = "robonet"
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = false
  skip_final_snapshot    = true
  publicly_accessible    = false

  tags = {
    Name = "robonet-rds-postgres"
  }
}

# ─────────────────────────────────────────
# ElastiCache Redis 7
# ─────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "robonet-redis-subnet-group"
  subnet_ids = [aws_subnet.private.id, aws_subnet.private_c.id]

  tags = {
    Name = "robonet-redis-subnet-group"
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "robonet-redis"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = {
    Name = "robonet-elasticache-redis"
  }
}

# ─────────────────────────────────────────
# EFS
# ─────────────────────────────────────────

resource "aws_efs_file_system" "ckpt" {
  creation_token = "robonet-ckpt-efs"
  encrypted      = true

  tags = {
    Name = "robonet-efs-ckpt"
  }
}

resource "aws_security_group" "efs" {
  name        = "robonet-efs-sg"
  description = "Security group for EFS mount targets"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "NFS from Voyager"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.voyager.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "robonet-sg-efs"
  }
}

resource "aws_efs_mount_target" "private" {
  file_system_id  = aws_efs_file_system.ckpt.id
  subnet_id       = aws_subnet.private.id
  security_groups = [aws_security_group.efs.id]
}

# ─────────────────────────────────────────
# IAM Role for SSM Session Manager
# ─────────────────────────────────────────

resource "aws_iam_role" "ec2_ssm" {
  name = "robonet-ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = { Name = "robonet-ec2-ssm-role" }
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm" {
  name = "robonet-ec2-ssm-profile"
  role = aws_iam_role.ec2_ssm.name
}

# ─────────────────────────────────────────
# EC2 Minecraft Server
# ─────────────────────────────────────────

resource "aws_instance" "minecraft" {
  ami                    = var.minecraft_ami
  instance_type          = "t3.large"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.minecraft.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name

  user_data = <<-EOF
    #!/bin/bash
    set -e

    apt-get update -y
    apt-get install -y openjdk-17-jre-headless curl wget screen

    # Create minecraft user and directory
    useradd -m -s /bin/bash minecraft || true
    mkdir -p /opt/minecraft/server
    chown -R minecraft:minecraft /opt/minecraft

    # Download Fabric server installer for 1.19
    cd /opt/minecraft/server
    wget -O fabric-installer.jar \
      https://maven.fabricmc.net/net/fabricmc/fabric-installer/0.11.2/fabric-installer-0.11.2.jar

    # Install Fabric server (Minecraft 1.19)
    sudo -u minecraft java -jar fabric-installer.jar server -mcversion 1.19 -downloadMinecraft

    # Accept EULA
    echo "eula=true" > /opt/minecraft/server/eula.txt

    # Copy server.properties (will be configured separately)
    cat > /opt/minecraft/server/server.properties <<PROPS
    online-mode=false
    max-players=10
    spawn-protection=0
    gamemode=survival
    difficulty=normal
    level-seed=
    view-distance=10
    simulation-distance=8
    server-port=25565
    PROPS

    chown -R minecraft:minecraft /opt/minecraft

    # Create systemd service
    cat > /etc/systemd/system/minecraft.service <<SVC
    [Unit]
    Description=Minecraft Fabric 1.19 Server
    After=network.target

    [Service]
    User=minecraft
    WorkingDirectory=/opt/minecraft/server
    ExecStart=/usr/bin/java -Xmx4G -Xms2G -jar fabric-server-launch.jar nogui
    Restart=on-failure
    RestartSec=10

    [Install]
    WantedBy=multi-user.target
    SVC

    systemctl daemon-reload
    systemctl enable minecraft
    systemctl start minecraft
  EOF

  tags = {
    Name = "robonet-minecraft"
  }
}

# ─────────────────────────────────────────
# EC2 Voyager Agent
# ─────────────────────────────────────────

resource "aws_instance" "voyager" {
  ami                    = var.voyager_ami
  instance_type          = "c5.2xlarge"
  subnet_id              = aws_subnet.private.id
  vpc_security_group_ids = [aws_security_group.voyager.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name

  user_data = <<-EOF
    #!/bin/bash
    set -e

    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release nfs-common

    # Install Docker
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker

    # Mount EFS
    mkdir -p /mnt/efs/ckpt
    echo "${aws_efs_file_system.ckpt.id}.efs.${var.region}.amazonaws.com:/ /mnt/efs/ckpt nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0" \
      >> /etc/fstab
    mount -a

    # Create ckpt subdirectories for each agent
    mkdir -p /mnt/efs/ckpt/agent-1 /mnt/efs/ckpt/agent-2 /mnt/efs/ckpt/agent-3
  EOF

  tags = {
    Name = "robonet-voyager"
  }
}
