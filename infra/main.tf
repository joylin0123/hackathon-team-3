terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "syn-hackathon-team-3-tfstate"
    key          = "infra/terraform.tfstate"
    region       = "eu-west-1"
    profile      = "syn-hackathon-team-3"
    use_lockfile = true
  }
}

provider "aws" {
  profile = "syn-hackathon-team-3"
  region  = "eu-west-1"
}
