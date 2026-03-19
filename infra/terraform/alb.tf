# ─────────────────────────────────────────
# Public Subnet (AZ-c) for ALB multi-AZ
# ─────────────────────────────────────────

resource "aws_subnet" "public_c" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.4.0/24"
  availability_zone       = "ap-northeast-1c"
  map_public_ip_on_launch = true

  tags = {
    Name = "robonet-public-subnet-c"
  }
}

resource "aws_route_table_association" "public_c" {
  subnet_id      = aws_subnet.public_c.id
  route_table_id = aws_route_table.public.id
}

# ─────────────────────────────────────────
# ALB (Application Load Balancer)
# ─────────────────────────────────────────

resource "aws_lb" "api" {
  name               = "robonet-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public.id, aws_subnet.public_c.id]

  tags = {
    Name = "robonet-api-alb"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "robonet-api-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path                = "/api/v1/health"
    protocol            = "HTTP"
    port                = "3001"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "robonet-api-tg"
  }
}

resource "aws_lb_target_group_attachment" "voyager" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.voyager.id
  port             = 3001
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
