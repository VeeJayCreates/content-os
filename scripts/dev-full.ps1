$ErrorActionPreference = "Stop"

$WhisperServer = "D:\Social media\local-ai\whisper.cpp\build\bin\Release\whisper-server.exe"
$WhisperModel = "D:\Social media\local-ai\whisper.cpp\ggml-base.bin"
$Supertonic = "D:\Social media\local-ai\supertonic-runtime\.venv\Scripts\supertonic.exe"
$LlamaServer = "D:\Social media\llama.cpp\llama-server.exe"
$EmbeddingModel = "D:\Social media\ContentOS-Models\qwen3-emb-0.6b-Q4_K_M.gguf"
$RerankerModel = "D:\Social media\ContentOS-Models\bge-reranker-v2-m3-Q4_K_M.gguf"

$Root = Split-Path -Parent $PSScriptRoot
$LogDirectory = Join-Path $Root ".local\dev-full-logs"
$Children = @()
$ManagedServices = @()

function Test-LocalPort {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $connected = $result.AsyncWaitHandle.WaitOne(500)
        if ($connected) { $client.EndConnect($result) }
        $client.Close()
        return $connected
    }
    catch { return $false }
}

function Test-LocalHttp {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    }
    catch { return $false }
}

function Get-ServiceLogTail {
    param([string]$LogPath)
    if (-not (Test-Path -LiteralPath $LogPath)) { return "No managed log was written." }
    return ((Get-Content -LiteralPath $LogPath -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine)
}

function Test-ServiceReady {
    param([pscustomobject]$Service)
    if (-not (Test-LocalPort -Port $Service.Port)) { return $false }
    if ([string]::IsNullOrWhiteSpace($Service.HealthUrl)) { return $true }
    return Test-LocalHttp -Url $Service.HealthUrl
}

function Wait-ServiceReady {
    param([pscustomobject]$Service)
    $deadline = (Get-Date).AddSeconds($Service.StartupTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Service.Owned -and $Service.Process.HasExited) {
            throw "$($Service.Name) exited before readiness with code $($Service.Process.ExitCode). Log: $($Service.LogPath)`n$(Get-ServiceLogTail -LogPath $Service.LogPath)"
        }
        if (Test-ServiceReady -Service $Service) { return }
        Start-Sleep -Milliseconds 500
    }
    $health = if ([string]::IsNullOrWhiteSpace($Service.HealthUrl)) { "TCP only" } else { $Service.HealthUrl }
    throw "$($Service.Name) did not become ready within $($Service.StartupTimeoutSeconds) seconds. Port: $($Service.Port). Health: $health. Log: $($Service.LogPath)`n$(Get-ServiceLogTail -LogPath $Service.LogPath)"
}

function Stop-ManagedServiceTree {
    param([System.Diagnostics.Process]$Process, [string]$Name)
    if ($Process.HasExited) { return }

    & taskkill.exe /PID $Process.Id /T /F | Out-Null
    Start-Sleep -Milliseconds 500
    $Process.Refresh()
    if (-not $Process.HasExited) {
        throw "Failed to stop launcher-owned $Name process tree rooted at PID $($Process.Id)."
    }
}

function Start-ManagedService {
    param(
        [string]$Name,
        [int]$Port,
        [string]$FileName,
        [string]$Arguments,
        [string]$HealthUrl = "",
        [int]$StartupTimeoutSeconds = 60,
        [hashtable]$Environment = @{}
    )

    New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
    $logPath = Join-Path $LogDirectory ("{0}.log" -f (($Name.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')))

    if (Test-LocalPort -Port $Port) {
        $service = [pscustomobject]@{ Name = $Name; Port = $Port; HealthUrl = $HealthUrl; Process = $null; Owned = $false; LogPath = $logPath; StartupTimeoutSeconds = $StartupTimeoutSeconds }
        Wait-ServiceReady -Service $service
        $script:ManagedServices += $service
        Write-Host "[OK] $Name already healthy on port $Port"
        return
    }

    Write-Host "[STARTING] $Name"
    Set-Content -LiteralPath $logPath -Value "ContentOS managed service: $Name`nStarted: $(Get-Date -Format o)" -Encoding utf8

    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $FileName
    $info.Arguments = $Arguments
    $info.WorkingDirectory = $Root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) { $info.EnvironmentVariables[$key] = [string]$Environment[$key] }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    $process.add_OutputDataReceived({ param($sender, $event) if ($event.Data) { Add-Content -LiteralPath $logPath -Value $event.Data -Encoding utf8 } })
    $process.add_ErrorDataReceived({ param($sender, $event) if ($event.Data) { Add-Content -LiteralPath $logPath -Value "[stderr] $($event.Data)" -Encoding utf8 } })
    if (-not $process.Start()) { throw "Failed to start $Name" }
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    $service = [pscustomobject]@{ Name = $Name; Port = $Port; HealthUrl = $HealthUrl; Process = $process; Owned = $true; LogPath = $logPath; StartupTimeoutSeconds = $StartupTimeoutSeconds }
    $script:Children += $process
    $script:ManagedServices += $service
    Wait-ServiceReady -Service $service
    Write-Host "[OK] $Name ready on port $Port"
}

foreach ($requiredFile in @($WhisperServer, $WhisperModel, $Supertonic, $LlamaServer, $EmbeddingModel, $RerankerModel)) {
    if (-not (Test-Path -LiteralPath $requiredFile)) { throw "Required local runtime file is missing: $requiredFile" }
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
    YOUTUBE_TRANSCRIPT_PYTHON = if ($env:YOUTUBE_TRANSCRIPT_PYTHON) { $env:YOUTUBE_TRANSCRIPT_PYTHON } else { "C:\Users\diamond\AppData\Local\Programs\Python\Python311\python.exe" }
}

Write-Host ""
Write-Host "========================================"
Write-Host "ContentOS Local Stack"
Write-Host "========================================"
Write-Host ""

try {
    Start-ManagedService -Name "Whisper" -Port 8080 -FileName $WhisperServer -Arguments "-m `"$WhisperModel`" --host 127.0.0.1 --port 8080" -HealthUrl "http://127.0.0.1:8080/health" -StartupTimeoutSeconds 90
    Start-ManagedService -Name "Qwen Embedding" -Port 8082 -FileName $LlamaServer -Arguments "--model `"$EmbeddingModel`" --host 127.0.0.1 --port 8082 --embedding --alias Qwen3-Embedding-0.6B" -HealthUrl "http://127.0.0.1:8082/health" -StartupTimeoutSeconds 180
    Start-ManagedService -Name "BGE Reranker" -Port 8083 -FileName $LlamaServer -Arguments "--model `"$RerankerModel`" --host 127.0.0.1 --port 8083 --rerank --alias bge-reranker-v2-m3" -HealthUrl "http://127.0.0.1:8083/health" -StartupTimeoutSeconds 180
    Start-ManagedService -Name "Supertonic" -Port 7788 -FileName $Supertonic -Arguments "serve --host 127.0.0.1 --port 7788" -StartupTimeoutSeconds 90
    Start-ManagedService -Name "API" -Port 3001 -FileName "cmd.exe" -Arguments '/d /s /c "pnpm.cmd --filter api start:dev"' -HealthUrl "http://127.0.0.1:3001/api/projects" -Environment $JarvisEnvironment
    Start-ManagedService -Name "Dashboard" -Port 3000 -FileName "cmd.exe" -Arguments '/d /s /c "pnpm.cmd --filter dashboard dev"' -HealthUrl "http://127.0.0.1:3000"

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
    Write-Host "Logs           : $LogDirectory"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop services started by this launcher."
    Write-Host ""

    while ($true) {
        Start-Sleep -Seconds 2
        foreach ($service in $ManagedServices) {
            if ($service.Owned -and $service.Process.HasExited) {
                throw "$($service.Name) exited with code $($service.Process.ExitCode). Log: $($service.LogPath)`n$(Get-ServiceLogTail -LogPath $service.LogPath)"
            }
            if (-not (Test-ServiceReady -Service $service)) {
                throw "$($service.Name) is no longer healthy on port $($service.Port). Log: $($service.LogPath)`n$(Get-ServiceLogTail -LogPath $service.LogPath)"
            }
        }
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping ContentOS services..."
    $cleanupFailures = @()
    foreach ($service in $ManagedServices | Where-Object { $_.Owned }) {
        try { Stop-ManagedServiceTree -Process $service.Process -Name $service.Name }
        catch { $cleanupFailures += $_.Exception.Message }
    }
    if ($cleanupFailures.Count) { Write-Warning ($cleanupFailures -join [Environment]::NewLine) }
    Write-Host "ContentOS local stack stopped."
}
