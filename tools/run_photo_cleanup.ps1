Param(
  [switch]$InPlace
)

$ErrorActionPreference = 'Stop'

if (-not $env:OPENAI_API_KEY) {
  Write-Error 'OPENAI_API_KEY no esta definido en el entorno.'
}

python -m pip install --upgrade pip openai pillow

if ($InPlace) {
  python tools/openai_photo_cleanup.py --in-place
} else {
  python tools/openai_photo_cleanup.py
}
