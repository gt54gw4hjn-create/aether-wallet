$lines = Get-Content 'src\App.tsx'
$out = $lines[0..2760] + $lines[2892..($lines.Length-1)]
Set-Content 'src\App.tsx' $out -Encoding UTF8
Write-Host ('Done. Lines now: ' + (Get-Content 'src\App.tsx').Count)
