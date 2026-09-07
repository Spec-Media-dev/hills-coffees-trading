import React from 'react';

/* Thin wrapper over the Lucide icon set (line/outline, uniform stroke) used by the
   live Hills Coffee build. Renders a Lucide placeholder and hydrates it once the
   CDN script is present, so icons stay real SVGs rather than hand-drawn paths. */
export function Icon({ name, size = 18, strokeWidth = 1.75, color = 'currentColor', style, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    el.appendChild(i);
    const draw = () => window.lucide && window.lucide.createIcons({ nameAttr: 'data-lucide', root: el });
    draw();
    if (!window.lucide) {
      const t = setInterval(() => { if (window.lucide) { draw(); clearInterval(t); } }, 120);
      return () => clearInterval(t);
    }
  }, [name]);
  return (
    <span ref={ref} aria-hidden="true" style={{ display: 'inline-flex', width: size, height: size, color, flex: '0 0 auto', ['--lucide-size']: size + 'px', ...style }}
      data-icon-size={size} data-stroke={strokeWidth}
      {...rest} />
  );
}
