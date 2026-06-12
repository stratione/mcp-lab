"""Shared exception types for labctl."""


class LabError(Exception):
    """A user-facing error: printed friendly (no traceback), exit code 1."""
