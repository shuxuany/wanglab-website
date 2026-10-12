# Minimal static file server for the portable website package.
# Uses only built-in Windows PowerShell (.NET HttpListener); nothing to install.
# Serves the "site" folder next to this script on http://localhost:<port>/ and opens the browser.

param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'site'))

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.gif' = 'image/gif'; '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.pdf' = 'application/pdf'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = $null
$port = 0
foreach ($p in 8080..8099) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l
    $port = $p
    break
  } catch { }
}
if (-not $listener) {
  Write-Host 'Could not find a free port between 8080 and 8099.'
  Read-Host 'Press Enter to exit'
  exit 1
}

$url = "http://localhost:$port/"
Write-Host ''
Write-Host "  Website is running at $url"
Write-Host '  Keep this window open while viewing. Close it to stop.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $file = '' }
    if ($file -and (Test-Path -LiteralPath $file -PathType Container)) { $file = Join-Path $file 'index.html' }
    $status = 200
    if (-not $file -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $file = Join-Path $root '404.html'
      $status = 404
    }
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
    $type = $mime[$ext]
    if (-not $type) { $type = 'application/octet-stream' }
    $res.StatusCode = $status
    $res.ContentType = $type
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
