$ErrorActionPreference = 'Stop'
$patterns = @(
  'AIza[0-9A-Za-z_-]{35}',
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
)

$excludeDirs = @('node_modules', 'dist', 'coverage', '.git', '.next', 'build')
$targetPaths = @('backend/src', 'backend/prisma', 'backend/tests', 'frontend/src', 'docs', 'scripts', '.github')

$files = Get-ChildItem -Path $targetPaths -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $path = $_.FullName
  -not ($excludeDirs | Where-Object { $path -like "*\$_*" -or $path -like "*/$_/*" })
}

foreach ($pattern in $patterns) {
  $matches = $files | Select-String -Pattern $pattern
  if ($matches) {
    $matches | ForEach-Object { Write-Error "Potential secret detected at $($_.Path):$($_.LineNumber)" }
    exit 1
  }
}
Write-Output 'Secret scan passed.'


