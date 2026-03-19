"""Shared fixtures for SDK tests."""
import pytest
import httpx


@pytest.fixture
def base_url() -> str:
    return "http://test-api/api/v1"
