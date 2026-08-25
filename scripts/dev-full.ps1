$ErrorActionPreference = "Stop"

$WhisperServer = "D:\Social media\local-ai\whisper.cpp\build\bin\Release\whisper-server.exe"
$WhisperModel = "D:\Social media\local-ai\whisper.cpp\ggml-base.bin"
$Supertonic = "D:\Social media\local-ai\supertonic-runtime\.venv\Scripts\supertonic.exe"
$LlamaServer = "D:\Social media\llama.cpp\llama-server.exe"
$EmbeddingModel = "D:\Social media\ContentOS-Models\qwen3-emb-0.6b-Q4_K_M.gguf"
$RerankerModel = "D:\Social media\ContentOS-Models\bge-reranker-v2-m3-Q4_K_M.gguf"

$Root = Split-Path -Parent $PSScriptRoot
$Children = @()

function Test-LocalPort {
    param(
        [int]$Port
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $connected = $result.AsyncWaitHandle.WaitOne(500)

        if ($connected) {
            $client.EndConnect($result)
            $client.Close()
            return $true
        }

        $client.Close()
        return $false
    }
    catch {
        return $false
    }
}

function Start-ManagedService {
    param(
        [string]$Name,
        [int]$Port,
        [string]$FileName,
        [string]$Arguments,
        [hashtable]$Environment = @{}
    )

    if (Test-LocalPort -Port $Port) {
        Write-Host "[OK] $Name already running on port $Port"
        return
    }

    Write-Host "[STARTING] $Name"

    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $FileName
    $info.Arguments = $Arguments
    $info.WorkingDirectory = $Root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true

    foreach ($key in $Environment.Keys) {
        $info.EnvironmentVariables[$key] = [string]$Environment[$key]
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info

    if (-not $process.Start()) {
        throw "Failed to start $Name"
    }

    $script:Children += $process

    Start-Sleep -Milliseconds 800

    if ($process.HasExited) {
        throw "$Name exited immediately with code $($process.ExitCode)"
    }

    Write-Host "[OK] $Name started on port $Port"
}

foreach ($requiredFile in @(
    $WhisperServer,
    $WhisperModel,
    $Supertonic,
    $LlamaServer,
    $EmbeddingModel,
    $RerankerModel
)) {
    if (-not (Test-Path -LiteralPath $requiredFile)) {
        throw "Required local runtime file is missing: $requiredFile"
    }
}

$JarvisEnvironment = @{
    JARVIS_STT_PROVIDER = "whisper-cpp"
    LOCAL_WHISPER_URL = "http://127.0.0.1:8080"

    JARVIS_TTS_PROVIDER = "supertonic"
    SUPERTONIC_URL = "http://127.0.0.1:7788"
    JARVIS_TTS_VOICE = "M1"

    AI_LOCAL_EMBEDDING_BASE_URL = "http://127.0.0.1:8082"
    AI_LOCAL_EMBEDDING_MODEL = "Qwen3-Embedding-0.6B"

    AI_LOCAL_RERANK_BASE_URL = "http://127.0.0.1:8083"
    AI_LOCAL_RERANK_MODEL = "bge-reranker-v2-m3"
}

Write-Host ""
Write-Host "========================================"
Write-Host "ContentOS Local Stack"
Write-Host "========================================"
Write-Host ""

try {
    Start-ManagedService `
        -Name "Whisper" `
        -Port 8080 `
        -FileName $WhisperServer `
        -Arguments "-m `"$WhisperModel`" --host 127.0.0.1 --port 8080"

    Start-ManagedService `
        -Name "Qwen Embedding" `
        -Port 8082 `
        -FileName $LlamaServer `
        -Arguments "--model `"$EmbeddingModel`" --host 127.0.0.1 --port 8082 --embedding --alias Qwen3-Embedding-0.6B"

    Start-ManagedService `
        -Name "BGE Reranker" `
        -Port 8083 `
        -FileName $LlamaServer `
        -Arguments "--model `"$RerankerModel`" --host 127.0.0.1 --port 8083 --rerank --alias bge-reranker-v2-m3"

    Start-ManagedService `
        -Name "Supertonic" `
        -Port 7788 `
        -FileName $Supertonic `
        -Arguments "serve --host 127.0.0.1 --port 7788"

    Start-ManagedService `
		-Name "API" `
		-Port 3001 `
		-FileName "cmd.exe" `
		-Arguments '/d /s /c "pnpm.cmd --filter api start:dev"' `
		-Environment $JarvisEnvironment

    Start-ManagedService `
		-Name "Dashboard" `
		-Port 3000 `
		-FileName "cmd.exe" `
		-Arguments '/d /s /c "pnpm.cmd --filter dashboard dev"'

    Write-Host ""
    Write-Host "========================================"
    Write-Host "ContentOS ready"
    Write-Host "========================================"
    Write-Host "Whisper        : http://127.0.0.1:8080"
    Write-Host "Qwen Embedding : http://127.0.0.1:8082"
    Write-Host "BGE Reranker   : http://127.0.0.1:8083"
    Write-Host "Supertonic     : http://127.0.0.1:7788"
    Write-Host "API            : http://localhost:3001"
    Write-Host "Dashboard      : http://localhost:3000"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop services started by this launcher."
    Write-Host ""

    while ($true) {
        Start-Sleep -Seconds 2

        foreach ($process in $Children) {
            if ($process.HasExited) {
                throw "A managed service exited with code $($process.ExitCode)"
            }
        }
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping ContentOS services..."

    foreach ($process in $Children) {
        try {
            if (-not $process.HasExited) {
                & taskkill.exe /PID $process.Id /T /F | Out-Null
            }
        }
        catch {
        }
    }

    Write-Host "ContentOS local stack stopped."
}