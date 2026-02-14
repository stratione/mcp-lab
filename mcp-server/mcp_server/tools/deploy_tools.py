from mcp.server.fastmcp import FastMCP
from .. import config

# Host port mapping per environment
ENV_PORTS = {"dev": 9080, "staging": 9081, "prod": 9082}

def register(mcp: FastMCP):
    @mcp.tool()
    async def deploy_app(image_name: str, tag: str, environment: str = "prod") -> str:
        """
        Deploy an application to a specific environment.

        Pulls the image from the appropriate registry and runs it as a
        Docker container on the mcp-lab-net network.

        Port mapping: dev→9080, staging→9081, prod→9082.

        Args:
            image_name: Name of the image to deploy.
            tag: Tag of the image.
            environment: Target environment (dev, staging, prod).

        Returns:
            JSON string with deployment status and accessible URL.
        """
        import json
        import asyncio

        if environment not in ENV_PORTS:
            return json.dumps({
                "status": "error",
                "error": f"Invalid environment: {environment}. Must be one of: dev, staging, prod."
            }, indent=2)

        # Extract host:port from http:// URLs for docker pull
        reg_url = config.PROD_REGISTRY_URL if environment == "prod" else config.DEV_REGISTRY_URL
        registry = reg_url.replace("http://", "").replace("https://", "")
        full_image = f"{registry}/{image_name}:{tag}"
        container_name = f"hello-app-{environment}"
        host_port = ENV_PORTS[environment]

        steps = []
        try:
            # Remove any existing container with the same name
            proc = await asyncio.create_subprocess_exec(
                "docker", "rm", "-f", container_name,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.wait()
            steps.append(f"Removed old container '{container_name}' (if any)")

            # Pull the image
            proc = await asyncio.create_subprocess_exec(
                "docker", "pull", full_image,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                return json.dumps({
                    "status": "error",
                    "error": f"docker pull failed: {stderr.decode().strip()}"
                }, indent=2)
            steps.append(f"Pulled {full_image}")

            # Run the container
            proc = await asyncio.create_subprocess_exec(
                "docker", "run", "-d",
                "--name", container_name,
                "--network", "mcp-lab_mcp-lab-net",
                "-p", f"{host_port}:8080",
                full_image,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                return json.dumps({
                    "status": "error",
                    "error": f"docker run failed: {stderr.decode().strip()}"
                }, indent=2)
            container_id = stdout.decode().strip()[:12]
            steps.append(f"Started container {container_id}")

        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": str(e),
                "steps_completed": steps,
            }, indent=2)

        app_url = f"http://localhost:{host_port}"
        return json.dumps({
            "status": "success",
            "message": f"Deployed {image_name}:{tag} to {environment}.",
            "container": container_name,
            "app_url": app_url,
            "steps": steps,
        }, indent=2)
