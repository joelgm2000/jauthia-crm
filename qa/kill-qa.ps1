# Detiene SOLO la instancia de QA (puertos 3100 y 5544). Nunca toca 3000/5433 (desarrollo del usuario).
foreach ($port in 3100, 5544) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($procId in ($c.OwningProcess | Select-Object -Unique)) {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine
    if ($port -eq 3100 -and $cmd -notmatch 'tsx') { "skip $procId"; continue }
    if ($port -eq 5544 -and $cmd -notmatch 'pgtest') { "skip $procId $cmd"; continue }
    Stop-Process -Id $procId -Force -Confirm:$false
    "killed $port ($procId)"
  }
}
