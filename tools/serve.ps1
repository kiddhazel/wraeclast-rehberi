# Arayüzü tarayıcıda önizlemek için minimal statik sunucu (Node/Python gerektirmez).
# Kullanım: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 5180]
param([int]$Port = 5180)

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\src")).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Önizleme: http://localhost:$Port/"

$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"; ".json" = "application/json"
  ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ($rel -eq "") { $rel = "index.html" }
  $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $ext = [IO.Path]::GetExtension($path).ToLower()
    $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
