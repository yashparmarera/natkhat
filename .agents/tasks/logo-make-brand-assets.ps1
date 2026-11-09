# logo-make-brand-assets.ps1
# Derives two NEW files from public/images/logo.png. logo.png itself is only READ (bytes loaded into memory) and is never written.
#   public/favicon.png   192x192 opaque cream square: the Devanagari mark only (the full 3:1 wordmark is an illegible smear at 16-32 px)
#   public/og-image.jpg  1200x630 opaque cream card: the full logo centred (<= ~60 KB; WhatsApp drops share images over ~300-600 KB)
# Usage (from anywhere):  powershell -NoProfile -ExecutionPolicy Bypass -File <project>\.agents\tasks\logo-make-brand-assets.ps1 [-OutDir <folder>]
# Default OutDir is <project>\public. The script keeps this file ASCII-only because Windows PowerShell 5.1 reads BOM-less files as ANSI.
param([string]$OutDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)      # <project>\.agents\tasks -> <project>
$srcPath = Join-Path $projectRoot 'public\images\logo.png'
if (-not $OutDir) { $OutDir = Join-Path $projectRoot 'public' }
if (-not (Test-Path -LiteralPath $srcPath)) { throw "logo not found: $srcPath" }
$expectedHash = 'E567CF0990186B79D28AB897DC3E5A07CE62CB8704E94ABB8CBD515D9FBA90B5'
$hashBefore = (Get-FileHash -LiteralPath $srcPath -Algorithm SHA256).Hash
if ($hashBefore -ne $expectedHash) { Write-Warning "logo.png SHA-256 differs from the one this script was tested with ($hashBefore). Crop seed (330,420) and scale 880/1687 assume the original artwork; re-check the output visually." }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$cs = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
public static class BrandAssets {
  // Returns a tight-cropped 32bpp ARGB bitmap containing ONLY the glyph: the 8-connected component of pixels with alpha >= alphaMin
  // that contains (seedX, seedY), plus a 2 px dilation so the soft anti-aliased edge is kept.
  public static Bitmap ExtractGlyph(Bitmap src, int seedX, int seedY, int alphaMin) {
    int w = src.Width, h = src.Height;
    BitmapData d = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    int stride = d.Stride; byte[] buf = new byte[stride * h];
    System.Runtime.InteropServices.Marshal.Copy(d.Scan0, buf, 0, buf.Length); src.UnlockBits(d);
    if (buf[seedY * stride + seedX * 4 + 3] < alphaMin) throw new Exception("seed pixel is transparent");
    bool[] keep = new bool[w * h]; int[] stack = new int[w * h]; int sp = 0;
    int s = seedY * w + seedX; keep[s] = true; stack[sp++] = s;
    int minX = w, maxX = -1, minY = h, maxY = -1;
    while (sp > 0) {
      int cur = stack[--sp]; int cx = cur % w, cy = cur / w;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue; int nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; int ni = ny * w + nx;
        if (keep[ni] || buf[ny * stride + nx * 4 + 3] < alphaMin) continue;
        keep[ni] = true; stack[sp++] = ni;
      }
    }
    for (int pass = 0; pass < 2; pass++) {
      bool[] next = (bool[])keep.Clone();
      for (int y = 1; y < h - 1; y++) for (int x = 1; x < w - 1; x++) {
        int i = y * w + x; if (keep[i] || buf[y * stride + x * 4 + 3] == 0) continue;
        if (keep[i - 1] || keep[i + 1] || keep[i - w] || keep[i + w]) next[i] = true;
      }
      keep = next;
    }
    minX = Math.Max(0, minX - 2); minY = Math.Max(0, minY - 2); maxX = Math.Min(w - 1, maxX + 2); maxY = Math.Min(h - 1, maxY + 2);
    int cw = maxX - minX + 1, ch = maxY - minY + 1;
    Bitmap outBmp = new Bitmap(cw, ch, PixelFormat.Format32bppArgb);
    BitmapData od = outBmp.LockBits(new Rectangle(0, 0, cw, ch), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    byte[] ob = new byte[od.Stride * ch];
    for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
      int sx = minX + x, sy = minY + y; int si = sy * stride + sx * 4; int oi = y * od.Stride + x * 4;
      if (keep[sy * w + sx]) { ob[oi] = buf[si]; ob[oi + 1] = buf[si + 1]; ob[oi + 2] = buf[si + 2]; ob[oi + 3] = buf[si + 3]; }
    }
    System.Runtime.InteropServices.Marshal.Copy(ob, 0, od.Scan0, ob.Length);
    outBmp.UnlockBits(od);
    return outBmp;
  }
}
'@
Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing

function New-HQGraphics([System.Drawing.Bitmap]$bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  return $g
}

$cream = [System.Drawing.ColorTranslator]::FromHtml('#F7F1E4')             # same cream as the site (bg-[#F7F1E4])
$bytes = [System.IO.File]::ReadAllBytes($srcPath)                          # read-only: the file handle is never held open
$ms = New-Object System.IO.MemoryStream(, $bytes)
$logo = New-Object System.Drawing.Bitmap([System.Drawing.Image]::FromStream($ms))

# ---- favicon.png: 192x192, Devanagari mark, 20 px padding, opaque (iOS paints transparent icon pixels black) ----
$glyph = [BrandAssets]::ExtractGlyph($logo, 330, 420, 8)
$size = 192; $pad = 20
$fav = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = New-HQGraphics $fav
$g.Clear($cream)
$box = $size - 2 * $pad
$scale = [Math]::Min($box / $glyph.Width, $box / $glyph.Height)
$dw = [int][Math]::Round($glyph.Width * $scale); $dh = [int][Math]::Round($glyph.Height * $scale)
$g.DrawImage($glyph, [int](($size - $dw) / 2), [int](($size - $dh) / 2), $dw, $dh)
$g.Dispose()
$favPath = Join-Path $OutDir 'favicon.png'
$fav.Save($favPath, [System.Drawing.Imaging.ImageFormat]::Png)
$fav.Dispose()

# ---- og-image.jpg: 1200x630, full logo, visible art ~880 px wide (1687 px = visible art width inside the 2172 px canvas) ----
$card = New-Object System.Drawing.Bitmap(1200, 630, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = New-HQGraphics $card
$g.Clear($cream)
$k = 880.0 / 1687.0
$lw = [int][Math]::Round(2172 * $k); $lh = [int][Math]::Round(724 * $k)
$g.DrawImage($logo, [int][Math]::Round((1200 - $lw) / 2), [int][Math]::Round((630 - $lh) / 2), $lw, $lh)
$g.Dispose()
$jpg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
$ogPath = Join-Path $OutDir 'og-image.jpg'
$card.Save($ogPath, $jpg, $ep)
$card.Dispose(); $glyph.Dispose(); $logo.Dispose(); $ms.Dispose()

foreach ($p in $favPath, $ogPath) {
  $img = [System.Drawing.Image]::FromFile($p)
  "{0}  {1}x{2}  {3:N0} bytes" -f $p, $img.Width, $img.Height, (Get-Item -LiteralPath $p).Length
  $img.Dispose()
}
$hashAfter = (Get-FileHash -LiteralPath $srcPath -Algorithm SHA256).Hash
if ($hashAfter -ne $hashBefore) { throw "logo.png changed while running - this must never happen" }
"logo.png untouched, SHA-256 $hashAfter"
