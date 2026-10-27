# sign-executables (JOS-207) Decision 4 — fails unless every given file has a valid Authenticode signature.
param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Files)
$invalid = $Files | Where-Object { (Get-AuthenticodeSignature $_).Status -ne 'Valid' }
if ($invalid) { Write-Error "not validly signed: $($invalid -join ', ')"; exit 1 }
Write-Host "all $($Files.Count) files carry a valid signature"
