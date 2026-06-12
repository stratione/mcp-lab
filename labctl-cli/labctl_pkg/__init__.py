"""labctl — stdlib-only CLI for driving the MCP DevOps lab from a terminal.

Every network call and every container-engine call can echo its raw
equivalent (`curl ...` / `docker ...`) with -v/--verbose — that is the
teaching feature: nothing labctl does is magic, it is always one raw
command away.
"""

__version__ = "1.0.0"
