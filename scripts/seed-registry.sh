#!/bin/sh
# Seed registry instructions — run from the host after podman compose is up

echo ""
echo "  ================================================"
echo "  To push a sample image to the dev registry,"
echo "  run these commands on your HOST machine:"
echo "  ================================================"
echo ""
echo "  podman pull alpine:3.19"
echo "  podman tag alpine:3.19 localhost:5001/sample-app:v1.0.0"
echo "  podman push localhost:5001/sample-app:v1.0.0"
echo ""
echo "  Then verify:"
echo "  curl http://localhost:5001/v2/_catalog"
echo "  curl http://localhost:5001/v2/sample-app/tags/list"
echo ""
