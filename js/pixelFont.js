// Zero-blur handcrafted 16-bit bitmap pixel font for razor-sharp in-canvas text (no blurry ctx.fillText!).

const GLYPHS = {
  A: [
    '.11.',
    '1..1',
    '1111',
    '1..1',
    '1..1',
  ],
  B: [
    '111.',
    '1..1',
    '111.',
    '1..1',
    '111.',
  ],
  C: [
    '.111',
    '1...',
    '1...',
    '1...',
    '.111',
  ],
  D: [
    '111.',
    '1..1',
    '1..1',
    '1..1',
    '111.',
  ],
  E: [
    '1111',
    '1...',
    '111.',
    '1...',
    '1111',
  ],
  F: [
    '1111',
    '1...',
    '111.',
    '1...',
    '1...',
  ],
  G: [
    '.111',
    '1...',
    '1.11',
    '1..1',
    '.111',
  ],
  H: [
    '1..1',
    '1..1',
    '1111',
    '1..1',
    '1..1',
  ],
  I: [
    '111',
    '.1.',
    '.1.',
    '.1.',
    '111',
  ],
  J: [
    '..11',
    '...1',
    '...1',
    '1..1',
    '.11.',
  ],
  K: [
    '1..1',
    '1.1.',
    '11..',
    '1.1.',
    '1..1',
  ],
  L: [
    '1...',
    '1...',
    '1...',
    '1...',
    '1111',
  ],
  M: [
    '1...1',
    '11.11',
    '1.1.1',
    '1...1',
    '1...1',
  ],
  N: [
    '1..1',
    '11.1',
    '1.11',
    '1..1',
    '1..1',
  ],
  O: [
    '.11.',
    '1..1',
    '1..1',
    '1..1',
    '.11.',
  ],
  P: [
    '111.',
    '1..1',
    '111.',
    '1...',
    '1...',
  ],
  Q: [
    '.11.',
    '1..1',
    '1..1',
    '1.11',
    '.111',
  ],
  R: [
    '111.',
    '1..1',
    '111.',
    '1.1.',
    '1..1',
  ],
  S: [
    '.111',
    '1...',
    '.11.',
    '...1',
    '111.',
  ],
  T: [
    '111',
    '.1.',
    '.1.',
    '.1.',
    '.1.',
  ],
  U: [
    '1..1',
    '1..1',
    '1..1',
    '1..1',
    '.11.',
  ],
  V: [
    '1..1',
    '1..1',
    '1..1',
    '.11.',
    '.11.',
  ],
  W: [
    '1...1',
    '1...1',
    '1.1.1',
    '11.11',
    '1...1',
  ],
  X: [
    '1..1',
    '1..1',
    '.11.',
    '1..1',
    '1..1',
  ],
  Y: [
    '1.1',
    '1.1',
    '.1.',
    '.1.',
    '.1.',
  ],
  Z: [
    '1111',
    '..1.',
    '.1..',
    '1...',
    '1111',
  ],
  '0': [
    '.11.',
    '1.11',
    '11.1',
    '1..1',
    '.11.',
  ],
  '1': [
    '.1.',
    '11.',
    '.1.',
    '.1.',
    '111',
  ],
  '2': [
    '111.',
    '...1',
    '.11.',
    '1...',
    '1111',
  ],
  '3': [
    '111.',
    '...1',
    '.11.',
    '...1',
    '111.',
  ],
  '4': [
    '1..1',
    '1..1',
    '1111',
    '...1',
    '...1',
  ],
  '5': [
    '1111',
    '1...',
    '111.',
    '...1',
    '111.',
  ],
  '6': [
    '.111',
    '1...',
    '111.',
    '1..1',
    '.11.',
  ],
  '7': [
    '1111',
    '...1',
    '..1.',
    '.1..',
    '.1..',
  ],
  '8': [
    '.11.',
    '1..1',
    '.11.',
    '1..1',
    '.11.',
  ],
  '9': [
    '.11.',
    '1..1',
    '.111',
    '...1',
    '111.',
  ],
  '!': [
    '1',
    '1',
    '1',
    '.',
    '1',
  ],
  '?': [
    '111',
    '..1',
    '.1.',
    '...',
    '.1.',
  ],
  '+': [
    '...',
    '.1.',
    '111',
    '.1.',
    '...',
  ],
  '-': [
    '...',
    '...',
    '111',
    '...',
    '...',
  ],
  '.': [
    '.',
    '.',
    '.',
    '.',
    '1',
  ],
  ',': [
    '.',
    '.',
    '.',
    '1',
    '1',
  ],
  ':': [
    '.',
    '1',
    '.',
    '1',
    '.',
  ],
  '/': [
    '..1',
    '..1',
    '.1.',
    '1..',
    '1..',
  ],
  '%': [
    '1.1',
    '..1',
    '.1.',
    '1..',
    '1.1',
  ],
  '&': [
    '.11.',
    '1.1.',
    '.111',
    '1..1',
    '.111',
  ],
  "'": [
    '1',
    '1',
    '.',
    '.',
    '.',
  ],
  '(': [
    '.1',
    '1.',
    '1.',
    '1.',
    '.1',
  ],
  ')': [
    '1.',
    '.1',
    '.1',
    '.1',
    '1.',
  ],
  '\u2192': [
    '..1.',
    '...1',
    '1111',
    '...1',
    '..1.',
  ],
  '\u2022': [
    '..',
    '.1',
    '11',
    '.1',
    '..',
  ],
  ' ': [
    '..',
    '..',
    '..',
    '..',
    '..',
  ],
};

export function measurePixelText(text, scale = 1) {
  const s = String(text || '').toUpperCase();
  if (!s.length) return 0;
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s[i]] || GLYPHS[' '];
    w += g[0].length * scale;
    if (i < s.length - 1) w += scale;
  }
  return w;
}

export function drawPixelText(ctx, text, x, y, color = '#ffffff', outlineColor = '#090f1d', scale = 1, align = 'center') {
  const s = String(text || '').toUpperCase();
  if (!s.length) return;
  const totalW = measurePixelText(s, scale);
  let cursorX = Math.round(
    align === 'center' ? x - totalW * 0.5 : align === 'right' ? x - totalW : x
  );
  const baseY = Math.round(y - 5 * scale);

  // Pass 1: crisp 1px dark outline around every glyph pixel (pure integer fillRect — zero blur!)
  if (outlineColor) {
    ctx.fillStyle = outlineColor;
    let ox = cursorX;
    for (let i = 0; i < s.length; i++) {
      const g = GLYPHS[s[i]] || GLYPHS[' '];
      const gw = g[0].length;
      for (let row = 0; row < 5; row++) {
        const line = g[row];
        for (let col = 0; col < gw; col++) {
          if (line[col] !== '1') continue;
          const px = ox + col * scale;
          const py = baseY + row * scale;
          ctx.fillRect(px - scale, py, scale, scale);
          ctx.fillRect(px + scale, py, scale, scale);
          ctx.fillRect(px, py - scale, scale, scale);
          ctx.fillRect(px, py + scale, scale, scale);
          // Drop corner shadow for classic 16-bit readability
          ctx.fillRect(px + scale, py + scale, scale, scale);
        }
      }
      ox += (gw + 1) * scale;
    }
  }

  // Pass 2: crisp solid glyph foreground pixels
  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s[i]] || GLYPHS[' '];
    const gw = g[0].length;
    for (let row = 0; row < 5; row++) {
      const line = g[row];
      for (let col = 0; col < gw; col++) {
        if (line[col] !== '1') continue;
        ctx.fillRect(cursorX + col * scale, baseY + row * scale, scale, scale);
      }
    }
    cursorX += (gw + 1) * scale;
  }
}
