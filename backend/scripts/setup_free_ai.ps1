<#
.SYNOPSIS
Downloads the free local AI models required by DocTraceAI.
#>

$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Ollama is not installed. Install it from https://ollama.com/download and run this script again."
}

Write-Host "Downloading the local embedding model..."
ollama pull nomic-embed-text

Write-Host "Downloading the local chat model..."
ollama pull llama3

Write-Host "DocTraceAI free local AI models are ready."
