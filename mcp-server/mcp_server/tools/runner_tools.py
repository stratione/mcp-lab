from mcp.server.fastmcp import FastMCP
import asyncio
import os
import shutil
import subprocess
import tempfile
from .. import config

def register(mcp: FastMCP):
    @mcp.tool()
    async def build_image(repo_url: str, image_name: str, tag: str = "latest") -> str:
        """
        Clone a git repository, build a Docker image from it, and push it to the dev registry.
        
        Args:
            repo_url: URL of the git repository to clone.
            image_name: Name of the image to build.
            tag: Tag for the image (default: latest).
            
        Returns:
            JSON string with build status and details.
        """
        import json
        
        # Create a temporary directory for cloning
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                # 1. Clone the repository
                mcp.server.request_context.session.send_log_message(
                    level="info", data=f"Cloning {repo_url}..."
                )
                
                # Use subprocess to run git clone
                proc = await asyncio.create_subprocess_exec(
                    "git", "clone", repo_url, ".",
                    cwd=temp_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await proc.communicate()
                
                if proc.returncode != 0:
                    return json.dumps({
                        "status": "error",
                        "step": "git_clone",
                        "error": stderr.decode(),
                        "repo_url": repo_url
                    }, indent=2)

                # 2. Build the Docker image
                full_image_name = f"{config.DEV_REGISTRY_HOST}/{image_name}:{tag}"
                mcp.server.request_context.session.send_log_message(
                    level="info", data=f"Building {full_image_name}..."
                )
                
                proc = await asyncio.create_subprocess_exec(
                    "docker", "build", "-t", full_image_name, ".",
                    cwd=temp_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await proc.communicate()
                
                if proc.returncode != 0:
                    return json.dumps({
                        "status": "error",
                        "step": "docker_build",
                        "error": stderr.decode(),
                        "image": full_image_name
                    }, indent=2)

                # 3. Push to Registry
                mcp.server.request_context.session.send_log_message(
                    level="info", data=f"Pushing {full_image_name}..."
                )
                
                proc = await asyncio.create_subprocess_exec(
                    "docker", "push", full_image_name,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await proc.communicate()
                
                if proc.returncode != 0:
                    return json.dumps({
                        "status": "error",
                        "step": "docker_push",
                        "error": stderr.decode(),
                        "image": full_image_name
                    }, indent=2)
                
                return json.dumps({
                    "status": "success",
                    "image": full_image_name,
                    "repo_url": repo_url,
                    "message": "Image built and pushed successfully."
                }, indent=2)
                
            except Exception as e:
                return json.dumps({
                    "status": "error",
                    "step": "unknown",
                    "error": str(e)
                }, indent=2)

    @mcp.tool()
    async def scan_image(image_name: str, tag: str = "latest") -> str:
        """
        Simulate a security scan on a Docker image.
        
        Args:
            image_name: Name of the image to scan.
            tag: Tag of the image.
            
        Returns:
            JSON string with security report.
        """
        import json
        import random
        
        # Mock security scan logic
        # In a real scenario, this would call Trivy or similar
        
        vulnerabilities = []
        
        # 20% chance of finding a "critical" vulnerability if not 'auth-service' (just for demo)
        if "auth-service" not in image_name and random.random() < 0.2:
             vulnerabilities.append({
                "id": "CVE-2026-1234",
                "severity": "CRITICAL",
                "package": "openssl",
                "fixed_version": "3.0.15",
                "description": "Buffer overflow in SSL handshake."
            })
        
        # Always find some low/medium issues
        vulnerabilities.append({
            "id": "CVE-2026-5678",
            "severity": "LOW",
            "package": "curl",
            "fixed_version": "8.10.1",
            "description": "Minor information leak."
        })
        
        status = "PASSED" if not any(v['severity'] == "CRITICAL" for v in vulnerabilities) else "FAILED"
        
        return json.dumps({
            "status": status,
            "image": f"{image_name}:{tag}",
            "scanner": "Trivy (Mock)",
            "vulnerabilities": vulnerabilities,
            "summary": {
                "critical": sum(1 for v in vulnerabilities if v['severity'] == "CRITICAL"),
                "high": 0,
                "medium": 0,
                "low": sum(1 for v in vulnerabilities if v['severity'] == "LOW"),
            }
        }, indent=2)
