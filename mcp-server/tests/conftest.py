import sys
from pathlib import Path

# Make `mcp_server` importable when running pytest from mcp-server/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
