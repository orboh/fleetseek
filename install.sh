#!/usr/bin/env bash
# FleetSeek CLI install script
# Usage: bash install.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing FleetSeek CLI dependencies..."
npm install --prefix "$SCRIPT_DIR/packages/cli"

echo "Linking fleetseek command globally..."
npm link --prefix "$SCRIPT_DIR/packages/cli"

echo ""
echo "FleetSeek CLI installed successfully."
echo ""
echo "Getting started:"
echo "  1. fleetseek auth login          # authenticate with your API key"
echo "  2. fleetseek robot register      # register your G1 robot"
echo "  3. fleetseek session start       # display env variable setup"
echo "  4. fleetseek search <query>      # search experiences"
echo ""
echo "Run 'fleetseek --help' to see all commands."
