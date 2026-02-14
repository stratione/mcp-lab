from mcp.server.fastmcp import FastMCP
from .. import config

def register(mcp: FastMCP):
    @mcp.tool()
    async def deploy_app(image_name: str, tag: str, environment: str = "prod") -> str:
        """
        Deploy an application to a specific environment.
        
        Args:
            image_name: Name of the image to deploy.
            tag: Tag of the image.
            environment: Target environment (e.g., 'staging', 'prod').
            
        Returns:
            JSON string with deployment status.
        """
        import json
        import asyncio
        
        # Mock deployment logic
        # In a real scenario, this might update a K8s manifest or restart a container
        
        if environment not in ["dev", "staging", "prod"]:
             return json.dumps({
                "status": "error",
                "error": f"Invalid environment: {environment}. Must be one of: dev, staging, prod."
            }, indent=2)
            
        # Simulate deployment delay
        await asyncio.sleep(2)
        
        app_url = f"http://{image_name}.{environment}.mcp-lab.local"
        
        return json.dumps({
            "status": "success",
            "message": f"Successfully deployed {image_name}:{tag} to {environment}.",
            "app_url": app_url,
            "deployment_id": "dep-123456789"
        }, indent=2)
