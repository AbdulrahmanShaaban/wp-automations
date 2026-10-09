# make-placeholders.ps1 — generate demo product images (gradient placeholders,
# same palette as the theme's .thumb.a–d cards).
# Output: wp-content/plugins/nilad-core/assets/product-placeholders/
# NOTE: inside the mounted plugin dir so wp-cli (container) can media-import them;
# plain wp-content/uploads on the host is NOT visible inside the wp-env container.
# Idempotent: overwrites the same 8 files.
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "..\wp-content\plugins\nilad-core\assets\product-placeholders"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$gradients = @{
  a = '#E4F1EC', '#D8CFC0'
  b = '#EFE6D8', '#DCD3C4'
  c = '#E8E4EF', '#D4CEC2'
  d = '#F0E4DA', '#D9CDC1'
}
$items = @(
  @{ f = 'abaya';     g = 'a' },
  @{ f = 'bag';       g = 'b' },
  @{ f = 'watch';     g = 'c' },
  @{ f = 'sunglasses';g = 'd' },
  @{ f = 'shirt';     g = 'b' },
  @{ f = 'scarf';     g = 'd' },
  @{ f = 'dress';     g = 'a' },
  @{ f = 'tee';       g = 'c' }
)

$W, $H = 800, 1000

function New-Gradient([string]$hex1, [string]$hex2) {
  $c1 = [System.Drawing.ColorTranslator]::FromHtml($hex1)
  $c2 = [System.Drawing.ColorTranslator]::FromHtml($hex2)
  return @{ c1 = $c1; c2 = $c2 }
}

foreach ($it in $items) {
  $grad = New-Gradient $gradients[$it.g][0] $gradients[$it.g][1]
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'

  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $grad.c1, $grad.c2, 140)
  $g.FillRectangle($brush, $rect)

  # soft geometric accents (no text — avoids GDI+ Arabic shaping issues)
  $accent = [System.Drawing.Color]::FromArgb(36, 24, 16)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, $accent))), 520, 90, 340, 340)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, $accent))), -80, 620, 420, 420)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, $accent), 3)
  $g.DrawEllipse($pen, 560, 130, 260, 260)
  $g.DrawEllipse($pen, 60, 660, 300, 300)

  $path = Join-Path $out "$($it.f).jpg"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $pen.Dispose()
  Write-Host "wrote $path"
}

# ---------------------------------------------------------------------------
# Social preview image (Open Graph / Twitter card), 1200x630 as the platforms
# expect. No text on purpose: GDI+ has no Arabic shaping, so a wordless brand
# gradient is honest and renders identically everywhere.
# ---------------------------------------------------------------------------
$ow, $oh = 1200, 630
$obmp = New-Object System.Drawing.Bitmap($ow, $oh)
$og2 = [System.Drawing.Graphics]::FromImage($obmp)
$og2.SmoothingMode = 'AntiAlias'
$orect = New-Object System.Drawing.Rectangle(0, 0, $ow, $oh)
$o1 = [System.Drawing.ColorTranslator]::FromHtml('#0B6B57')
$o2 = [System.Drawing.ColorTranslator]::FromHtml('#FAF8F4')
$obrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($orect, $o1, $o2, 25)
$og2.FillRectangle($obrush, $orect)
$oaccent = [System.Drawing.Color]::FromArgb(40, 11, 107, 87)
$og2.FillEllipse((New-Object System.Drawing.SolidBrush($oaccent)), 780, -120, 520, 520)
$og2.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, 180, 83, 9))), 60, 300, 300, 300)
$open = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 255, 255, 255), 4)
$og2.DrawEllipse($open, 820, -80, 440, 440)
$opath = Join-Path $PSScriptRoot "..\wp-content\plugins\nilad-core\assets\product-placeholders\og-nilad.jpg"
$obmp.Save($opath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$og2.Dispose(); $obmp.Dispose(); $obrush.Dispose(); $open.Dispose()
Write-Host "wrote $opath"

Write-Host "done: $($items.Count) placeholders + 1 og image -> wp-content/plugins/nilad-core/assets/product-placeholders/"
