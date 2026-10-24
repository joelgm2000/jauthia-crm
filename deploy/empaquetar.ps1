# Empaqueta el proyecto para subirlo al servidor (sin node_modules, compilados, bases locales ni secretos).
# Uso (PowerShell, desde la carpeta jauthia-crm):   powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
# Crea ..\jauthia-crm.zip. En el servidor se descomprime con:  python3 -m zipfile -e jauthia-crm.zip .
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$name = Split-Path -Leaf $root
$out = Join-Path (Split-Path -Parent $root) 'jauthia-crm.zip'

# Carpetas que nunca se suben (en cualquier nivel) y rutas concretas que tampoco.
$skipDirs = @('node_modules', 'dist', 'lib', '.angular', '.pgdata', '.git', '.vscode', '.claude', 'backups', 'pgtest', 'results')
$skipFiles = @('.env', '.qa-owner', '.qa-demo.json')
$skipExt = @('.log', '.zip', '.tgz')

function Test-Skip([string]$rel) {
  $parts = $rel -split '[\\/]'
  foreach ($p in $parts[0..($parts.Length - 2)]) { if ($skipDirs -contains $p) { return $true } }
  $file = $parts[-1]
  return ($skipFiles -contains $file) -or ($skipExt -contains [IO.Path]::GetExtension($file))
}

if (Test-Path $out) { Remove-Item $out -Force }
$zip = [IO.Compression.ZipFile]::Open($out, 'Create')
$count = 0
try {
  Get-ChildItem -Path $root -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    if (-not (Test-Skip $rel)) {
      $entry = "$name/" + ($rel -replace '\\', '/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry, 'Optimal')
      $count++
    }
  }
} finally {
  $zip.Dispose()
}
$mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "Listo: $out ($count archivos, $mb MB)"
Write-Host "Subelo al servidor:  scp -i <tu-llave.key> `"$out`" ubuntu@<IP-del-servidor>:~"
