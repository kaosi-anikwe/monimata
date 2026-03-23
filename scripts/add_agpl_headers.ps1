$root = "C:\Users\anikw\Documents\projects\monimata-clone"
$enc  = [System.Text.UTF8Encoding]::new($false)   # UTF-8 without BOM

$pyHeader = @'
# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

'@

$tsHeader = @'
// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

'@

# ── Python files (skip .venv and __pycache__) ──────────────────────────────
$pyFiles = Get-ChildItem -Recurse "$root\apps\api" -Include "*.py" |
    Where-Object { $_.FullName -notmatch "\\\.venv\\" -and
                   $_.FullName -notmatch "\\__pycache__\\" }

foreach ($f in $pyFiles) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    if ($content -notmatch "GNU Affero General Public License") {
        [System.IO.File]::WriteAllText($f.FullName, $pyHeader + $content, $enc)
        Write-Host "  [py]  $($f.Name)"
    }
}

# ── TypeScript / TSX files (skip node_modules) ────────────────────────────
$tsDirs = @("$root\apps\mobile", "$root\libs")
foreach ($dir in $tsDirs) {
    if (-not (Test-Path $dir)) { continue }
    $tsFiles = Get-ChildItem -Recurse $dir -Include "*.ts","*.tsx" |
        Where-Object { $_.FullName -notmatch "\\node_modules\\" }

    foreach ($f in $tsFiles) {
        $content = [System.IO.File]::ReadAllText($f.FullName)
        if ($content -notmatch "GNU Affero General Public License") {
            [System.IO.File]::WriteAllText($f.FullName, $tsHeader + $content, $enc)
            Write-Host "  [ts]  $($f.Name)"
        }
    }
}

Write-Host "`nAGPL headers applied."
